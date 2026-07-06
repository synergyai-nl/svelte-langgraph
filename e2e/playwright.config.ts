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
				// Tolerate ANSI escape codes around the URL in colorized logs.
				stdout: /Uvicorn running on .*localhost:8080/
			}
		},
		{
			name: 'backend',
			command: 'moon backend:serve-e2e',
			// First run may pull the postgres image and run database migrations.
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
				// Tolerate ANSI escape codes within the URL in colorized logs.
				stdout: /http:\/\/localhost:.*4173/
			}
		}
	]
});
