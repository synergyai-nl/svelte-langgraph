import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser, expectOIDCProviderURL } from './fixtures/auth';
import { gotoFreshThread, LANGGRAPH_CONFIG } from './fixtures/backend';
import { OIDC_CONFIG, OidcPage } from './pages';

test.describe.configure({ mode: 'default', timeout: 90_000 });

async function configure(request: APIRequestContext, settings: Record<string, unknown>) {
	const response = await request.post(`${OIDC_CONFIG.issuer}/__test__/settings`, {
		data: settings
	});
	expect(response.ok()).toBe(true);
}

async function token(page: Page) {
	const response = await page.request.post('/api/backend-token', {
		headers: { Origin: new URL(page.url()).origin }
	});
	expect(response.ok()).toBe(true);
	expect(response.headers()['cache-control']).toContain('no-store');
	return (await response.json()) as { accessToken: string; expiresAt: string };
}

async function waitUntilExpired(expiresAt: string) {
	// Exercise real provider/backend time. Browser clock overrides cannot expire JWTs.
	await expect
		.poll(() => Date.now(), { timeout: 20_000, intervals: [250] })
		.toBeGreaterThan(Date.parse(expiresAt) + 1000);
}

async function refreshes(request: APIRequestContext) {
	const response = await request.get(`${OIDC_CONFIG.issuer}/__test__/settings`);
	return ((await response.json()) as { refreshes: { credential: string; known: boolean }[] })
		.refreshes;
}

test.beforeEach(async ({ request }) => {
	await configure(request, { reset: true, lifetime: 12 });
});

test.afterEach(async ({ request }) => {
	await configure(request, { reset: true });
});

test('two real expirations preserve chat and use rotated cookies for streaming, sidebar and feedback', async ({
	page,
	chat,
	sidebar,
	context,
	request
}) => {
	// Encrypted account payload must cross a cookie boundary; response cookie
	// chunk propagation is exercised through the real SvelteKit handler.
	await configure(request, { padding: 3500 });
	await authenticateUser(page);
	const threadId = await gotoFreshThread(page);
	await expect(chat.textInput).toBeEnabled();
	const originalInput = await chat.textInput.elementHandle();
	const first = await token(page);
	const accountCookies = (await context.cookies()).filter((cookie) =>
		cookie.name.includes('account_data')
	);
	expect(accountCookies.length).toBeGreaterThan(1);
	const originalCookies = accountCookies.map(({ value }) => value).join('');
	let documentRequests = 0;
	page.on('request', (req) => {
		if (req.isNavigationRequest() && req.frame() === page.mainFrame()) documentRequests++;
	});

	await waitUntilExpired(first.expiresAt);
	const streamed = page.waitForResponse(
		(response) =>
			response.url().startsWith(LANGGRAPH_CONFIG.apiUrl) && response.url().includes('/runs/stream')
	);
	const searched = page.waitForResponse((response) => response.url().endsWith('/threads/search'));
	await chat.textInput.fill('Hello after token expiry');
	await chat.textInput.press('Enter');
	expect((await streamed).ok()).toBe(true);
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });
	await expect(chat.aiMessages.first()).not.toBeEmpty();
	expect((await searched).ok()).toBe(true);
	await expect(sidebar.threadLink(threadId)).toBeVisible();
	const second = await token(page);
	expect(second.accessToken).not.toBe(first.accessToken);
	expect(
		(await context.cookies())
			.filter((cookie) => cookie.name.includes('account_data'))
			.map(({ value }) => value)
			.join('')
	).not.toBe(originalCookies);

	await waitUntilExpired(second.expiresAt);
	await chat.aiMessages.first().hover();
	await chat.feedbackButtons(chat.aiMessages.first()).up.click();
	await expect(chat.feedbackDialog).toBeVisible();
	const scored = page.waitForResponse((response) => response.url().endsWith('/feedback'));
	await chat.feedbackCancel.click();
	expect((await scored).ok()).toBe(true);
	await expect(chat.aiMessages.first().getByTestId('feedback-failed')).toHaveCount(0);
	const third = await token(page);
	expect(third.accessToken).not.toBe(second.accessToken);
	const attempts = await refreshes(request);
	expect(attempts).toHaveLength(2);
	expect(attempts.every(({ known }) => known)).toBe(true);
	expect(attempts[0].credential).not.toBe(attempts[1].credential);
	expect(await originalInput?.evaluate((element) => element.isConnected)).toBe(true);
	expect(documentRequests).toBe(0);
	await expect(chat.loginModal).toBeHidden();
});

test('refresh without a replacement refresh token keeps the usable credential', async ({
	page,
	request
}) => {
	await configure(request, { rotate: false });
	await authenticateUser(page);
	const first = await token(page);
	await waitUntilExpired(first.expiresAt);
	const second = await token(page);
	await waitUntilExpired(second.expiresAt);
	const third = await token(page);
	expect(third.accessToken).not.toBe(second.accessToken);
	const attempts = await refreshes(request);
	expect(attempts).toHaveLength(2);
	expect(attempts.every(({ known }) => known)).toBe(true);
	expect(attempts[0].credential).toBe(attempts[1].credential);
});

for (const providerError of ['invalid_grant', 'temporarily_unavailable']) {
	test(`${providerError} preserves chat, offers recovery and never replays a write`, async ({
		page,
		chat,
		request
	}) => {
		await authenticateUser(page);
		await gotoFreshThread(page);
		await chat.textInput.fill('Hello');
		await chat.textInput.press('Enter');
		await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });
		await expect(chat.textInput).toBeEnabled();
		const current = await token(page);
		await configure(request, { refresh_error: providerError });
		await waitUntilExpired(current.expiresAt);
		let writes = 0;
		page.on('request', (req) => {
			if (req.method() === 'POST' && req.url().includes('/runs/stream')) writes++;
		});
		await chat.textInput.fill('Do not replay this');
		await chat.textInput.press('Enter');
		await expect(chat.loginModal).toBeVisible();
		await expect(chat.modalSignInButton).toBeVisible();
		const retry = chat.loginModal.getByRole('button', { name: 'Retry', exact: true });
		await expect(retry).toBeVisible();
		expect(writes).toBe(0);
		await expect(chat.aiMessages).toHaveCount(1);
		await configure(request, { refresh_error: null });
		await retry.click();
		await expect(chat.loginModal).toBeHidden();
		expect(writes).toBe(0);
		await expect(chat.aiMessages).toHaveCount(1);
	});
}

test('a backend 401 preserves the signed-in session and does not replay the rejected run', async ({
	page,
	chat
}) => {
	await authenticateUser(page);
	await gotoFreshThread(page);
	await expect(chat.textInput).toBeEnabled();
	let writes = 0;
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
		writes++;
		await route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: '{"detail":"Unavailable"}'
		});
	});
	await chat.textInput.fill('Reject this run once');
	await chat.textInput.press('Enter');
	await expect(chat.loginModal).toBeVisible();
	expect(writes).toBe(1);
	await chat.loginModal.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(chat.loginModal).toBeHidden();
	expect(writes).toBe(1);
	expect((await token(page)).accessToken).toBeTruthy();
});

test('retry restarts a failed initial thread lookup without reloading', async ({ page, chat }) => {
	await authenticateUser(page);
	let initializationReads = 0;
	await page.route('**/threads/search', async (route) => {
		const query = route.request().postDataJSON() as { limit?: number; status?: string };
		if (query.limit === 1 && query.status === 'idle') {
			initializationReads++;
			if (initializationReads === 1) {
				await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
				return;
			}
		}
		await route.continue();
	});

	await page.goto('/chat');
	await expect(chat.loginModal).toBeVisible();
	let documentRequests = 0;
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
	});

	await chat.loginModal.getByRole('button', { name: 'Retry', exact: true }).click();
	await page.waitForURL(/\/chat\/[\w-]+/);
	await expect(chat.textInput).toBeEnabled();
	expect(initializationReads).toBe(2);
	expect(documentRequests).toBe(0);
});

test('retry restarts failed assistant and history initialization without reloading', async ({
	page,
	chat
}) => {
	await authenticateUser(page);
	let assistantReads = 0;
	await page.route('**/assistants/search', async (route) => {
		assistantReads++;
		if (assistantReads === 1) {
			await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
			return;
		}
		await route.continue();
	});
	const threadId = await gotoFreshThread(page);
	await expect(chat.loginModal).toBeVisible();
	let documentRequests = 0;
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
	});

	await chat.loginModal.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(chat.loginModal).toBeHidden();
	await expect(chat.historyLoading).toBeHidden();
	await expect(chat.textInput).toBeEnabled();
	expect(page.url()).toContain(`/chat/${threadId}`);
	expect(assistantReads).toBe(2);
	expect(documentRequests).toBe(0);
});

test('sign-in after refresh failure returns to the existing thread without replaying the failed run', async ({
	page,
	chat,
	request
}) => {
	await authenticateUser(page);
	const threadId = await gotoFreshThread(page);
	await chat.textInput.fill('Hello');
	await chat.textInput.press('Enter');
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });
	await expect(chat.textInput).toBeEnabled();
	const current = await token(page);
	await configure(request, { refresh_error: 'invalid_grant' });
	await waitUntilExpired(current.expiresAt);
	let writes = 0;
	page.on('request', (req) => {
		if (req.method() === 'POST' && req.url().includes('/runs/stream')) writes++;
	});
	await chat.textInput.fill('Never replay this after sign-in');
	await chat.textInput.press('Enter');
	await expect(chat.loginModal).toBeVisible();
	expect(writes).toBe(0);
	await chat.app.signIn(chat.modalSignInButton);
	await expectOIDCProviderURL(page);
	await new OidcPage(page).authorize();
	await page.waitForURL(`/chat/${threadId}`);
	await expect(chat.loginModal).toBeHidden();
	await expect(chat.historyLoading).toBeHidden();
	await expect(chat.aiMessages).toHaveCount(1);
	await expect(chat.textInput).toBeEnabled();
	expect((await token(page)).accessToken).not.toBe(current.accessToken);
	expect(writes).toBe(0);
});
