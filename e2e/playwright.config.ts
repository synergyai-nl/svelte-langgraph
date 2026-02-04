import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'src',
	// Run all tests in parallel.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// Opt out of parallel tests on CI.
	workers: process.env.CI ? 1 : undefined,
	reporter: [['html', { open: 'never' }], [process.env.CI ? 'github' : 'list']],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: process.env.CI ? 'only-on-failure' : 'off'
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
			url: 'http://localhost:8080/.well-known/openid-configuration',
			timeout: 120000,
			stdout: 'ignore',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 0 },
			ignoreHTTPSErrors: false,
			// @ts-expect-error: wait actually runs and exists but is not properly defined on the type.
			wait: /Uvicorn running on http:\/\/localhost:8080/
		},
		{
			name: 'backend',
			command: 'moon backend:serve-e2e',
			url: 'http://localhost:2024/ok',
			timeout: 120000,
			stdout: 'ignore',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 0 },
			// @ts-expect-error: wait actually runs and exists but is not properly defined on the type.
			wait: /Registering graph with id/
		},
		{
			name: 'frontend',
			command: 'moon frontend:serve-e2e',
			url: 'http://localhost:4173',
			timeout: 120000,
			stdout: 'ignore',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 0 },
			// @ts-expect-error: wait actually runs and exists but is not properly defined on the type.
			wait: /http:\/\/localhost:4173/
		}
	]
});
