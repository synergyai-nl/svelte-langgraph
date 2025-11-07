import type { Page } from '@playwright/test';

/**
 * LangGraph Backend Configuration
 */
export const LANGGRAPH_CONFIG = {
	apiUrl: 'http://127.0.0.1:2024'
};

/**
 * Helper to extract access token from session storage or cookies
 */
export async function getAccessToken(page: Page): Promise<string | null> {
	// The access token is stored in the session by auth.ts
	// We need to extract it from the page context
	const token = await page.evaluate(() => {
		// Try to get it from session storage first
		const sessionData = sessionStorage.getItem('session');
		if (sessionData) {
			try {
				const parsed = JSON.parse(sessionData);
				return parsed.accessToken || null;
			} catch {
				return null;
			}
		}
		return null;
	});

	return token;
}

/**
 * Helper to make authenticated request to LangGraph backend
 */
export async function makeAuthenticatedRequest(
	page: Page,
	endpoint: string,
	options: RequestInit = {}
): Promise<Response> {
	// Extract session data from the page
	const sessionData = await page.evaluate(() => {
		// Access the page data which should contain the session
		// @ts-expect-error - accessing window.__sveltekit_data
		const data = window.__sveltekit_data;
		return data?.nodes?.[0]?.data?.[0]?.session || null;
	});

	if (!sessionData?.accessToken) {
		throw new Error('No access token found in session');
	}

	// Make the request with the Authorization header
	const url = `${LANGGRAPH_CONFIG.apiUrl}${endpoint}`;
	const response = await page.request.fetch(url, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${sessionData.accessToken}`,
			'Content-Type': 'application/json'
		}
	});

	return response;
}

/**
 * Helper to verify backend is accessible
 */
export async function verifyBackendHealth(page: Page): Promise<boolean> {
	try {
		const response = await page.request.fetch(`${LANGGRAPH_CONFIG.apiUrl}/ok`);
		return response.ok;
	} catch {
		return false;
	}
}
