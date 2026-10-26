import { defineConfig } from '@playwright/test';
import application from './playwright.config';
import type { Options } from './src/fixtures/test';

// `moon e2e:test-runtime-contract`: the API-level checks in backend-integration.spec.ts (tagged
// @runtime-contract) against Aegra and the LangGraph development server. No frontend runs, so
// checks that drive the app (tagged @frontend) are left out.

// The task syncs the backend's langgraph-test group first; keep the servers' moon and uv runs
// from syncing it away again.
const env = { ...process.env, UV_NO_SYNC: '1', MOON_SKIP_INSTALL_DEPS: '1' };

export default defineConfig<Options>({
	...application,
	testMatch: 'backend-integration.spec.ts',
	grep: /@runtime-contract/,
	grepInvert: /@frontend/,
	reporter: 'list',
	projects: [
		{ name: 'aegra', use: { apiUrl: 'http://localhost:2026' } },
		{ name: 'langgraph', use: { apiUrl: 'http://localhost:2027' } }
	],
	webServer: [
		...(Array.isArray(application.webServer) ? application.webServer : [])
			.filter((server) => server.name !== 'frontend')
			.map((server) => ({ ...server, env })),
		{
			name: 'langgraph',
			command: 'moon backend:langgraph-e2e',
			env,
			timeout: 180_000,
			stdout: 'pipe',
			stderr: 'pipe',
			gracefulShutdown: { signal: 'SIGINT', timeout: 1500 },
			url: 'http://localhost:2027/ok',
			reuseExistingServer: false
		}
	]
});
