import { defineConfig } from '@playwright/test';
import application from './playwright.config';

export default defineConfig({
	testDir: 'contracts',
	workers: 1,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: 'list',
	projects: [
		{ name: 'aegra', use: { baseURL: 'http://localhost:2026' } },
		{ name: 'langgraph', use: { baseURL: 'http://localhost:2027' } }
	],
	webServer: [
		...(Array.isArray(application.webServer) ? application.webServer : [])
			.filter((server) => server.name !== 'frontend')
			.map((server) => ({
				...server,
				env: { ...process.env, UV_NO_SYNC: '1', MOON_SKIP_INSTALL_DEPS: '1' }
			})),
		{
			name: 'langgraph',
			command: 'moon backend:langgraph-e2e',
			env: { ...process.env, UV_NO_SYNC: '1', MOON_SKIP_INSTALL_DEPS: '1' },
			timeout: 180_000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			url: 'http://localhost:2027/ok',
			reuseExistingServer: false
		}
	]
});
