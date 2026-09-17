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
 *
 * Returns the created thread's id, so callers that need it (e.g. sidebar specs
 * asserting on a specific row) don't have to re-derive it from the URL.
 */
export async function gotoFreshThread(page: Page): Promise<string> {
	const accessToken = await getAccessToken(page);

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

	return thread.thread_id;
}

/**
 * Get a current API token through the same cookie-persisting endpoint as the UI.
 */
export async function getAccessToken(page: Page): Promise<string> {
	const response = await page.request.post('/api/backend-token', {
		headers: { Origin: new URL(page.url()).origin }
	});
	expect(response.ok()).toBeTruthy();
	const { accessToken } = (await response.json()) as { accessToken: string };
	expect(accessToken).toBeTruthy();
	return accessToken;
}

/**
 * Helper to make authenticated request to LangGraph backend
 */
export async function makeAuthenticatedRequest(
	page: Page,
	endpoint: string,
	options: RequestInit = {}
): Promise<APIResponse> {
	const accessToken = await getAccessToken(page);

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
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});

	return response;
}
