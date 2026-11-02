import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backendAuth, getToken, resetBackendToken } from './backendToken.svelte';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('./client', () => ({ authClient: { getAccessToken } }));
// The page was rendered for user-a.
vi.mock('$app/state', () => ({ page: { data: { session: { user: { id: 'user-a' } } } } }));

const inMs = (ms: number) => new Date(Date.now() + ms);
const ok = (accessToken: string, accessTokenExpiresAt: Date | null = inMs(3_600_000)) => ({
	data: { accessToken, accessTokenExpiresAt, scopes: [], idToken: 'private-id' },
	error: null
});
const failed = (status: number, code?: string) => ({
	data: null,
	error: { status, statusText: 'x', code }
});
const accountChanged = failed(409, 'ACCOUNT_CHANGED');
const expectedUser = {
	headers: { 'x-slg-expected-user': 'user-a' },
	onResponse: expect.any(Function)
};

const reload = vi.fn();
const token = 'token-a';

beforeEach(() => {
	reload.mockReset();
	resetBackendToken(reload);
	getAccessToken.mockReset().mockImplementation(withServerDate(ok(token), 0));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/**
 * A mocked getAccessToken whose response carries a server `Date` taken `serverAheadMs` from the
 * local clock at send time (none when undefined), delivered after `delayMs` of fake time.
 */
const withServerDate = (result: ReturnType<typeof ok>, serverAheadMs?: number, delayMs = 0) =>
	vi.fn(async (_body: unknown, options: { onResponse: (ctx: { response: Response }) => void }) => {
		const headers = new Headers();
		if (serverAheadMs !== undefined) headers.set('date', inMs(serverAheadMs).toUTCString());
		if (delayMs) vi.advanceTimersByTime(delayMs);
		options.onResponse({ response: new Response(null, { headers }) });
		return result;
	});

describe('getToken', () => {
	test('judges freshness by the server clock: a token valid locally but near expiry by server time is refetched', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
		// Server is 60 s ahead; the token has 62 s left locally, so only 2 s by server time.
		getAccessToken.mockImplementation(withServerDate(ok(token, inMs(62_000)), 60_000));

		await getToken();
		await getToken();

		expect(getAccessToken).toHaveBeenCalledTimes(2);
	});

	test('a delayed response is not mistaken for clock skew', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
		// Clocks agree. The response arrives 10 s late with a Date from send time; the token
		// really expires 12 s after sending, so 2 s remain on receipt: inside the buffer.
		getAccessToken.mockImplementation(withServerDate(ok(token, inMs(12_000)), 0, 10_000));

		await getToken();
		await getToken();

		expect(getAccessToken).toHaveBeenCalledTimes(2);
	});

	test('without a usable Date header the token is not cached, whatever the browser clock says', async () => {
		vi.useFakeTimers({ now: new Date('2031-06-15T12:00:00Z') });
		getAccessToken.mockImplementation(withServerDate(ok(token, inMs(3_600_000))));

		await getToken();
		await getToken();

		expect(getAccessToken).toHaveBeenCalledTimes(2);
	});

	test('caches a token until it enters Better Auth’s refresh buffer', async () => {
		expect(await getToken()).toBe(token);
		expect(await getToken()).toBe(token);

		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith(
			{ useAccountCookie: true },
			expectedUser
		);
	});

	test.each([
		['inside the 5 s refresh buffer', inMs(4_000)],
		['without an expiry', null]
	])('asks again, once per call, for a token %s', async (_, expiry) => {
		getAccessToken.mockResolvedValue(ok(token, expiry));

		await getToken();
		await getToken();

		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(reload).not.toHaveBeenCalled();
	});

	test('concurrent callers share one request, which carries no abort signal', async () => {
		let release!: (value: ReturnType<typeof ok>) => void;
		getAccessToken.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const calls = [getToken(), getToken(), getToken()];
		release(ok(token));

		expect(await Promise.all(calls)).toEqual([token, token, token]);
		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith(
			{ useAccountCookie: true },
			expectedUser
		);
	});

	test('holds a cross-tab lock around the request when available', async () => {
		const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
		vi.stubGlobal('navigator', { locks: { request } });

		expect(await getToken()).toBe(token);
		expect(request).toHaveBeenCalledWith('slg-backend-token', expect.any(Function));
	});

	test.each([400, 401])(
		'a %s flags the session as expired and fails the request',
		async (status) => {
			getAccessToken.mockResolvedValue(failed(status));

			await expect(getToken()).rejects.toThrow(/session has expired/);
			expect(backendAuth.expired).toBe(true);

			getAccessToken.mockResolvedValue(ok(token));
			expect(await getToken()).toBe(token);
			expect(backendAuth.expired).toBe(false);
		}
	);

	test('a 5xx, 429 or network error fails the request without flagging the session', async () => {
		getAccessToken.mockResolvedValue(failed(503));
		await expect(getToken()).rejects.toThrow('503');

		getAccessToken.mockResolvedValue(failed(429));
		await expect(getToken()).rejects.toThrow('429');

		getAccessToken.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(getToken()).rejects.toThrow('Failed to fetch');

		expect(backendAuth.expired).toBe(false);
	});

	test('asserts the page’s user to the server and caches the token', async () => {
		expect(await getToken()).toBe(token);
		expect(await getToken()).toBe(token);

		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith(
			{ useAccountCookie: true },
			expectedUser
		);
		expect(reload).not.toHaveBeenCalled();
	});

	test('ACCOUNT_CHANGED on the first fetch reloads the page and neither returns nor caches a token', async () => {
		getAccessToken.mockResolvedValue(accountChanged);

		await expect(getToken()).rejects.toThrow(/account changed/);
		await expect(getToken()).rejects.toThrow(/account changed/);
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(reload).toHaveBeenCalledTimes(2);
		expect(backendAuth.expired).toBe(false);
	});

	test('ACCOUNT_CHANGED on a later refresh reloads the page', async () => {
		getAccessToken.mockResolvedValue(ok(token, inMs(1_000)));
		await getToken();
		getAccessToken.mockResolvedValue(accountChanged);

		await expect(getToken()).rejects.toThrow(/account changed/);
		expect(reload).toHaveBeenCalledOnce();
	});

	test('a page rendered without a user reloads without sending a request', async () => {
		const { page } = await import('$app/state');
		const data = page.data as { session: unknown };
		const original = data.session;
		data.session = null;
		try {
			await expect(getToken()).rejects.toThrow(/account changed/);
		} finally {
			data.session = original;
		}
		expect(getAccessToken).not.toHaveBeenCalled();
		expect(reload).toHaveBeenCalledOnce();
	});

	test('a refreshed token for the same user replaces the cached one without a reload', async () => {
		getAccessToken.mockResolvedValue(ok(token, inMs(1_000)));
		await getToken();
		getAccessToken.mockImplementation(withServerDate(ok('token-a-refreshed'), 0));

		expect(await getToken()).toBe('token-a-refreshed');
		expect(await getToken()).toBe('token-a-refreshed');
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(reload).not.toHaveBeenCalled();
	});
});
