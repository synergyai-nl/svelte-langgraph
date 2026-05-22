import { defineConfig, devices } from '@playwright/test';

/** Homepage tests only need the static frontend preview — no auth/backend. */
export default defineConfig({
	testDir: 'src',
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
