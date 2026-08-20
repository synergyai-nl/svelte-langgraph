import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'src',
	// Run all tests in parallel.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// Run with a single worker: all tests share the same backend user, and
	// parallel sessions race for the same idle thread via getOrCreateThread.
	// Aegra runs concurrent runs on a shared thread without queueing them
	// (no multitask strategy), which corrupts thread state across tests.
	workers: 1,
	expect: { timeout: 10_000 },
	reporter: [
		['html', { open: 'never' }],
		[process.env.CI ? 'github' : 'list'],
		['json', { outputFile: 'playwright-report/test-results.json' }]
	],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: process.env.CI ? 'only-on-failure' : 'off',
		contextOptions: {
			reducedMotion: 'reduce'
		}
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	// Readiness is detected via `wait.stdout`, not a port/url probe, so Playwright's
	// `reuseExistingServer` never applies here — every run starts fresh servers,
	// which is what guarantees the test database reset actually happens.
	webServer: [
		{
			name: 'ai-mock',
			command: 'moon backend:ai-mock-e2e',
			timeout: 120000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			wait: {
				stdout: /Uvicorn running on/
			}
		},
		{
			name: 'oidc',
			command: 'moon backend:oidc-mock',
			timeout: 120000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			ignoreHTTPSErrors: false,
			wait: {
				// ANSI-tolerant: moon force-colors task output in some environments (it strips
				// NO_COLOR from task env), so escape codes may appear inside the URL.
				stdout: /Uvicorn running on .*localhost:8080/
			}
		},
		{
			name: 'backend',
			command: 'moon backend:serve-e2e',
			// Startup drops/recreates the test database and runs Aegra's
			// migrations against it, which can be slow on a cold server.
			timeout: 180000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			wait: {
				stdout: /Application startup complete/
			}
		},
		{
			name: 'frontend',
			command: 'moon frontend:serve-e2e',
			timeout: 120000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			wait: {
				// ANSI-tolerant: vite bolds the port number, which may inject escape codes
				// (e.g. "\x1b[1m") between "localhost:" and the port when colors are forced.
				stdout: /http:\/\/localhost:.*4173/
			}
		}
	]
});
