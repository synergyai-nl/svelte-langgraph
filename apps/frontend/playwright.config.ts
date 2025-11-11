import { defineConfig, devices } from '@playwright/test';

// Test environment configuration
const testEnv = {
	AUTH_TRUST_HOST: 'true',
	AUTH_OIDC_CLIENT_ID: 'svelte-langgraph',
	AUTH_OIDC_CLIENT_SECRET: 'secret',
	AUTH_OIDC_ISSUER: 'http://localhost:8080',
	AUTH_SECRET: 'test-secret-for-e2e-testing-only-not-for-production-use',
	PUBLIC_LANGGRAPH_API_URL: 'http://127.0.0.1:2024',
	PUBLIC_SENTRY_DSN: ''
};

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
			url: 'http://127.0.0.1:8080/.well-known/openid-configuration',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGTERM', timeout: 500 },
			// Kill server when playwright exits
			ignoreHTTPSErrors: false
		},
		{
			name: 'backend',
			command: 'moon backend:dev',
			url: 'http://127.0.0.1:2024',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGTERM', timeout: 500 },
			env: {
				AUTH_OIDC_ISSUER: testEnv.AUTH_OIDC_ISSUER,
				AUTH_OIDC_AUDIENCE: testEnv.AUTH_OIDC_CLIENT_ID
			}
		},
		{
			name: 'frontend',
			command: 'moon frontend:preview',
			url: 'http://localhost:4173',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGTERM', timeout: 500 },
			env: testEnv
		}
	]
});
