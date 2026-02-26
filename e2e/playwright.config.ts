import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'src',
	// Run all tests in parallel.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// Opt out of parallel tests on CI.
	workers: process.env.CI ? 1 : undefined,
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
			name: 'oidc',
			command: 'moon backend:oidc-mock',
			timeout: 120000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			ignoreHTTPSErrors: false,
			wait: {
				stdout: /Uvicorn running on http:\/\/localhost:8080/
			}
		},
		{
			name: 'backend',
			command: 'moon backend:serve-e2e',
			timeout: 120000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			wait: {
				stdout: /Application started up in/
			}
		},
		{
			name: 'frontend',
			command: 'moon frontend:serve-e2e',
			timeout: 120000,
			stdout: 'ignore',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			wait: {
				stdout: /http:\/\/localhost:4173/
			}
		}
	]
});
