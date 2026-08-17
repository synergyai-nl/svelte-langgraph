import { expect, type Page, type APIResponse } from '@playwright/test';

/**
 * LangGraph Backend Configuration
 */
export const LANGGRAPH_CONFIG = {
	apiUrl: 'http://localhost:2026'
};

/**
 * Create a brand-new LangGraph thread and navigate directly to it.
 *
 * Every E2E spec authenticates as the same hardcoded OIDC identity (test-user,
 * see pages/oidc.page.ts), and the backend scopes thread search to that
 * identity (see apps/backend/src/svelte_langgraph/auth.py `add_owner`/
 * `filters = {"owner": ctx.user.identity}`). That means every spec shares one
 * pool of threads for that single user.
 *
 * Navigating to the plain `/chat` route calls getOrCreateThread()
 * (apps/frontend/src/lib/langgraph/client.ts), which reuses the
 * most-recently-updated *idle* thread for that user rather than creating a
 * fresh one. Any spec that relies on that route inherits whatever thread
 * (and mock-relevant persisted state, e.g. the `phase` field) another spec
 * last left idle — a real cross-spec race, not just a hypothetical one.
 *
 * The `/chat/[threadID]` route pins the app to whatever thread id is in the
 * URL with no reuse logic of its own, so creating the thread directly via the
 * LangGraph REST API and navigating straight there sidesteps getOrCreateThread
 * entirely — a pure test concern, no production code changes needed.
 *
 * Use this instead of `page.goto('/chat/')` in any spec whose assertions
 * depend on message content/count and don't specifically intend to exercise
 * the getOrCreateThread lazy-reuse-and-redirect flow itself.
 */
export async function gotoFreshThread(page: Page) {
	const sessionRes = await page.request.get('/auth/session');
	expect(sessionRes.ok()).toBeTruthy();
	const session = await sessionRes.json();
	const accessToken = session?.accessToken as string | undefined;
	expect(accessToken, 'expected an accessToken on the Auth.js session').toBeTruthy();

	const threadRes = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		data: { metadata: {} }
	});
	expect(threadRes.ok()).toBeTruthy();
	const thread = (await threadRes.json()) as { thread_id: string };

	await page.goto(`/chat/${thread.thread_id}`);
}

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
): Promise<APIResponse> {
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

	// Convert HeadersInit to a plain object
	const baseHeaders: Record<string, string> = {};
	if (options.headers) {
		const h = new Headers(options.headers);
		h.forEach((value, key) => {
			baseHeaders[key] = value;
		});
	}

	// Make the request with the Authorization header
	const url = `${LANGGRAPH_CONFIG.apiUrl}${endpoint}`;
	const response = await page.request.fetch(url, {
		...options,
		headers: {
			...baseHeaders,
			Authorization: `Bearer ${sessionData.accessToken}`,
			'Content-Type': 'application/json'
		}
	});

	return response;
}
