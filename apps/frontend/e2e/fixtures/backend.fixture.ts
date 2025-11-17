import { test as base } from './auth.fixture';
import type { APIResponse } from '@playwright/test';

/**
 * LangGraph Backend Configuration
 */
export const LANGGRAPH_CONFIG = {
	apiUrl: 'http://127.0.0.1:2024'
};

/**
 * Backend-related fixtures
 */
type BackendFixtures = {
	backendHelpers: BackendHelpers;
};

/**
 * Backend helper methods
 */
interface BackendHelpers {
	getAccessToken: () => Promise<string | null>;
	makeAuthenticatedRequest: (endpoint: string, options?: RequestInit) => Promise<APIResponse>;
	verifyBackendHealth: () => Promise<void>;
}

/**
 * Extend test with backend fixtures
 */
export const test = base.extend<BackendFixtures>({
	/**
	 * Backend helper methods as a fixture
	 */
	backendHelpers: async ({ page }, use) => {
		const helpers: BackendHelpers = {
			/**
			 * Extract access token from session storage or page context
			 */
			getAccessToken: async (): Promise<string | null> => {
				const token = await page.evaluate(() => {
					// Try session storage first
					const sessionData = sessionStorage.getItem('session');
					if (sessionData) {
						try {
							const parsed = JSON.parse(sessionData);
							return parsed.accessToken || null;
						} catch {
							return null;
						}
					}

					// Try to get from page data (SvelteKit specific)
					// @ts-expect-error - accessing window.__sveltekit_data
					const data = window.__sveltekit_data;
					return data?.nodes?.[0]?.data?.[0]?.session?.accessToken || null;
				});

				return token;
			},

			/**
			 * Make authenticated request to LangGraph backend
			 */
			makeAuthenticatedRequest: async (
				endpoint: string,
				options: RequestInit = {}
			): Promise<APIResponse> => {
				// Get access token from session
				const accessToken = await helpers.getAccessToken();

				if (!accessToken) {
					throw new Error('No access token found in session');
				}

				// Make the request with Authorization header
				const url = `${LANGGRAPH_CONFIG.apiUrl}${endpoint}`;
				const response = await page.request.fetch(url, {
					...options,
					headers: {
						...options.headers,
						Authorization: `Bearer ${accessToken}`,
						'Content-Type': 'application/json'
					}
				});

				return response;
			},

			/**
			 * Verify backend is accessible
			 */
			verifyBackendHealth: async (): Promise<void> => {
				const { expect } = await import('@playwright/test');
				const response = await page.request.get(`${LANGGRAPH_CONFIG.apiUrl}/ok`);
				expect(response.ok()).toBeTruthy();
			}
		};

		await use(helpers);
	}
});

export { expect } from '@playwright/test';
