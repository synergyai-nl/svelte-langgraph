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
	fullyParallel: false, // Run tests serially to avoid conflicts with shared backend
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Single worker to avoid OIDC mock conflicts
	reporter: [['html', { open: 'never' }]],
	use: {
		baseURL: 'http://localhost:5173',
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
			command: 'moon backend:oidc-mock',
			url: 'http://127.0.0.1:8080/.well-known/openid-configuration',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			// Kill server when playwright exits
			ignoreHTTPSErrors: false
		},
		{
			command: 'moon backend:dev',
			url: 'http://127.0.0.1:2024',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				AUTH_OIDC_ISSUER: testEnv.AUTH_OIDC_ISSUER,
				AUTH_OIDC_AUDIENCE: testEnv.AUTH_OIDC_CLIENT_ID
			}
		},
		{
			command: 'moon frontend:dev',
			url: 'http://localhost:5173',
			timeout: 120000,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
			env: testEnv
		}
	]
});
