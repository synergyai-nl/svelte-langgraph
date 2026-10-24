import type { APIRequestContext, Page, Request } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser, expectOIDCProviderURL } from './fixtures/auth';
import {
	fetchBackendToken,
	getBearerToken,
	gotoFreshThread,
	LANGGRAPH_CONFIG
} from './fixtures/backend';
import { OIDC_CONFIG, OidcPage } from './pages';

/**
 * Issue #303: the backend token is refreshed in the page, without a reload.
 *
 * Expiry is real time: the backend checks `exp`, and a mocked browser clock cannot expire a JWT.
 * Tokens live just above the app's 30 s skew (`SKEW_MS`), so each test acts as soon as the token
 * is inside that window, except the first, which waits for a token to really expire.
 */
test.describe.configure({ mode: 'default' });

/** `SKEW_MS` in apps/frontend/src/lib/auth/tokenSkew.ts. */
const SKEW_MS = 30_000;
/** Token lifetime in seconds: 10 s outside the skew window, room for sign-in and setup. */
const LIFETIME = 40;

async function configure(request: APIRequestContext, settings: Record<string, unknown>) {
	const response = await request.post(`${OIDC_CONFIG.issuer}/__test__/settings`, {
		data: settings
	});
	expect(response.ok()).toBe(true);
}

async function refreshes(request: APIRequestContext) {
	const response = await request.get(`${OIDC_CONFIG.issuer}/__test__/settings`);
	return ((await response.json()) as { refreshes: { credential: string; known: boolean }[] })
		.refreshes;
}

async function waitUntil(epochMs: number) {
	await expect
		.poll(() => Date.now(), { timeout: LIFETIME * 1000 + 15_000, intervals: [250] })
		.toBeGreaterThan(epochMs);
}

/** Count run POSTs, which are the writes a recovery must never replay. */
function countRuns(page: Page) {
	const runs: Request[] = [];
	page.on('request', (req) => {
		if (req.method() === 'POST' && /\/runs\/stream$/.test(new URL(req.url()).pathname))
			runs.push(req);
	});
	return runs;
}

/** A marker that a reload would wipe. */
async function markDocument(page: Page) {
	await page.evaluate(() => ((window as unknown as { slgMarker: boolean }).slgMarker = true));
	return () =>
		page.evaluate(() => (window as unknown as { slgMarker?: boolean }).slgMarker === true);
}

test.beforeEach(async ({ request }) => {
	// Before signing in: the mock sets the lifetime when it issues a token.
	await configure(request, { reset: true, lifetime: LIFETIME });
});

test.afterEach(async ({ request }) => {
	await configure(request, { reset: true });
});

test('after the token expires, chat, threads and feedback keep working without a reload', async ({
	page,
	chat,
	sidebar,
	request
}) => {
	test.setTimeout(LIFETIME * 1000 + 60_000);
	await authenticateUser(page);
	const other = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads`, {
		headers: { Authorization: `Bearer ${await getBearerToken(page)}` },
		data: { metadata: { graph_id: 'chat' } }
	});
	expect(other.ok()).toBe(true);
	const otherId = ((await other.json()) as { thread_id: string }).thread_id;
	const threadId = await gotoFreshThread(page);
	await expect(chat.textInput).toBeEnabled();
	const { accessToken, expiresAt } = await fetchBackendToken(page);
	const sameDocument = await markDocument(page);

	await waitUntil(expiresAt + 1000);

	await chat.textInput.fill('Hello after token expiry');
	await chat.textInput.press('Enter');
	const reply = await chat.expectAiReply('Hello after token expiry');

	await sidebar.threadLink(otherId).click();
	await page.waitForURL(`/chat/${otherId}`);
	await expect(chat.textInput).toBeEnabled();
	await sidebar.threadLink(threadId).click();
	await page.waitForURL(`/chat/${threadId}`);
	await chat.expectAiReply('Hello after token expiry');

	const scored = page.waitForResponse((res) => /\/feedback$/.test(new URL(res.url()).pathname));
	await reply.hover();
	await chat.feedbackButtons(chat.aiMessages.first()).up.click();
	await chat.feedbackCancel.click();
	expect((await scored).ok()).toBe(true);

	expect((await fetchBackendToken(page)).accessToken).not.toBe(accessToken);
	const attempts = await refreshes(request);
	expect(attempts.length).toBeGreaterThan(0);
	// Each refresh spent a live refresh token: the rotated cookie reached the browser every time.
	expect(attempts.every(({ known }) => known)).toBe(true);
	expect(await sameDocument()).toBe(true);
	await expect(chat.loginModal).toBeHidden();
});

test('a refresh that fails offers sign-in and returns to the thread without replaying the send', async ({
	page,
	chat,
	request
}) => {
	await authenticateUser(page);
	const threadId = await gotoFreshThread(page);
	await expect(chat.textInput).toBeEnabled();
	const { expiresAt } = await fetchBackendToken(page);
	await configure(request, { refresh_error: 'invalid_grant' });
	const runs = countRuns(page);

	await waitUntil(expiresAt - SKEW_MS + 500);
	await chat.textInput.fill('Do not replay this');
	await chat.textInput.press('Enter');

	await expect(chat.loginModal).toBeVisible();
	await expect(chat.loginModal).toContainText('Your session has expired');
	expect(runs).toHaveLength(0);

	await configure(request, { refresh_error: null });
	await chat.app.signIn(chat.modalSignInButton);
	await expectOIDCProviderURL(page);
	await new OidcPage(page).authorize();
	await page.waitForURL(`/chat/${threadId}`);
	await expect(chat.loginModal).toBeHidden();
	await expect(chat.historyLoading).toBeHidden();
	await expect(chat.textInput).toBeEnabled();
	await expect(chat.userMessage('Do not replay this')).toHaveCount(0);
	expect(runs).toHaveLength(0);
});

test('a draft in the composer survives a token refresh', async ({ page, chat, request }) => {
	await authenticateUser(page);
	await gotoFreshThread(page);
	const { expiresAt } = await fetchBackendToken(page);
	await chat.textInput.fill('Hello');
	await chat.textInput.press('Enter');
	const reply = await chat.expectAiReply('Hello');
	expect(await refreshes(request), 'the reply should land before the skew window').toHaveLength(0);

	const draft = 'A half-written thought';
	await chat.textInput.fill(draft);
	const composer = await chat.textInput.elementHandle();
	await waitUntil(expiresAt - SKEW_MS + 500);

	// A background request inside the skew window: rating the reply refreshes the token.
	const scored = page.waitForResponse((res) => /\/feedback$/.test(new URL(res.url()).pathname));
	await reply.hover();
	await chat.feedbackButtons(reply).up.click();
	await chat.feedbackCancel.click();
	expect((await scored).ok()).toBe(true);

	expect(await refreshes(request)).toHaveLength(1);
	expect(await composer?.evaluate((element) => element.isConnected)).toBe(true);
	await expect(chat.textInput).toHaveValue(draft);
	await expect(chat.loginModal).toBeHidden();
});
