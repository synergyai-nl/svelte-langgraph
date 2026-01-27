import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	// Run all tests in parallel.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// Opt out of parallel tests on CI.
	workers: process.env.CI ? 1 : undefined,
	reporter: [['html', { open: 'never' }]],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
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
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGTERM', timeout: 500 },
			ignoreHTTPSErrors: false
		},
		{
			name: 'backend',
			command: 'moon backend:serve-e2e',
			url: 'http://localhost:2024',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe'
		},
		{
			name: 'frontend',
			command: 'moon frontend:serve-e2e',
			url: 'http://localhost:4173',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGTERM', timeout: 500 }
		}
	]
});
