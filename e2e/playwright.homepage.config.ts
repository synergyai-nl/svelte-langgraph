import { defineConfig, devices } from '@playwright/test';

/** Homepage tests only need the static frontend preview — no auth/backend. */
export default defineConfig({
	testDir: 'src',
	// Only the homepage spec: this config starts the frontend preview alone, so the
	// auth/chat/thinking specs (which need the OIDC mock, backend and AI mock) would
	// otherwise be discovered here and fail.
	testMatch: /homepage\.spec\.ts$/,
	fullyParallel: true,
	expect: { timeout: 10_000 },
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'moon run frontend:serve-e2e',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
