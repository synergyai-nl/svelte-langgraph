import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'moon :preview',
		port: 4173
	},
	testDir: 'e2e',
	use: {
		baseURL: 'http://localhost:4173'
	}
});
