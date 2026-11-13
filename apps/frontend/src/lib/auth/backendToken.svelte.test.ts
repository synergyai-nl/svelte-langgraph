import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from '$app/state';
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
const expectedUserB = { ...expectedUser, headers: { 'x-slg-expected-user': 'user-b' } };
/** What a client-side navigation or invalidation leaves in page data; null is signed out. */
const setPageUser = (id: string | null) => {
	(page.data as { session: unknown }).session = id ? { user: { id } } : null;
};

const reload = vi.fn();
const token = 'token-a';

beforeEach(() => {
	setPageUser('user-a');
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

/** The next request is answered with user-a's cacheable token, but only once released. */
const heldForA = () => {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	const answer = withServerDate(ok(token), 0);
	getAccessToken.mockImplementationOnce(async (body, options) => {
		await released;
		return answer(body, options);
	});
	return release;
};

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
		getAccessToken.mockImplementationOnce(withServerDate(ok(token, inMs(12_000)), 0, 10_000));

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

	test.each([
		['by the server clock', 0],
		['with no Date header, by the local clock', undefined]
	])(
		'an already-expired token (no refresh token) flags the session and is not cached, %s',
		async (_, serverAheadMs) => {
			getAccessToken.mockImplementation(withServerDate(ok(token, inMs(-60_000)), serverAheadMs));

			await expect(getToken()).rejects.toThrow(/session has expired/);
			expect(backendAuth.expired).toBe(true);

			await expect(getToken()).rejects.toThrow(/session has expired/);
			expect(getAccessToken).toHaveBeenCalledTimes(2);
		}
	);

	test('a token valid locally but expired by the server clock is rejected', async () => {
		// Server is 60 s ahead; the token has 30 s left locally, so it expired 30 s ago by server time.
		getAccessToken.mockImplementation(withServerDate(ok(token, inMs(30_000)), 60_000));

		await expect(getToken()).rejects.toThrow(/session has expired/);
		expect(backendAuth.expired).toBe(true);
	});

	test('a fresh token after an expired one clears the flag', async () => {
		getAccessToken.mockImplementation(withServerDate(ok(token, inMs(-1_000)), 0));
		await expect(getToken()).rejects.toThrow(/session has expired/);
		expect(backendAuth.expired).toBe(true);

		getAccessToken.mockImplementation(withServerDate(ok('token-a-fresh'), 0));
		expect(await getToken()).toBe('token-a-fresh');
		expect(backendAuth.expired).toBe(false);
	});

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

	test('a cached token is not returned once the page is for another user', async () => {
		expect(await getToken()).toBe(token);
		setPageUser('user-b');
		getAccessToken.mockImplementation(withServerDate(ok('token-b'), 0));

		expect(await getToken()).toBe('token-b');
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(getAccessToken).toHaveBeenLastCalledWith({ useAccountCookie: true }, expectedUserB);
		expect(reload).not.toHaveBeenCalled();
	});

	test('a cached token is not returned once the page has no user', async () => {
		expect(await getToken()).toBe(token);
		setPageUser(null);

		await expect(getToken()).rejects.toThrow(/account changed/);
		expect(getAccessToken).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	test('a request in flight for one user is not shared with a page now for another', async () => {
		const releaseA = heldForA();
		const callerA = getToken();
		setPageUser('user-b');
		getAccessToken.mockImplementation(withServerDate(ok('token-b'), 0));

		const callerB = getToken();
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(getAccessToken).toHaveBeenLastCalledWith({ useAccountCookie: true }, expectedUserB);
		expect(await callerB).toBe('token-b');

		// user-a's answer lands late: it neither replaces user-b's cached token nor reaches its caller.
		releaseA();
		expect(await callerA).toBe('token-b');
		expect(await getToken()).toBe('token-b');
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(reload).not.toHaveBeenCalled();
	});

	test('a request that resolves after the page changed user fetches for the new user', async () => {
		const releaseA = heldForA();
		const caller = getToken();
		setPageUser('user-b');
		getAccessToken.mockImplementation(withServerDate(ok('token-b'), 0));
		releaseA();

		expect(await caller).toBe('token-b');
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(getAccessToken).toHaveBeenLastCalledWith({ useAccountCookie: true }, expectedUserB);
		expect(await getToken()).toBe('token-b');
		expect(getAccessToken).toHaveBeenCalledTimes(2);
	});

	test('a superseded request that settles first leaves the in-flight slot to its successor', async () => {
		let failA!: (reason: Error) => void;
		getAccessToken.mockReturnValueOnce(new Promise((_, reject) => (failA = reject)));
		const callerA = getToken();
		setPageUser('user-b');
		let releaseB!: (value: ReturnType<typeof ok>) => void;
		getAccessToken.mockReturnValueOnce(new Promise((resolve) => (releaseB = resolve)));
		const callerB = getToken();

		failA(new TypeError('Failed to fetch'));
		await expect(callerA).rejects.toThrow('Failed to fetch');
		const laterB = getToken();
		releaseB(ok('token-b'));

		expect(await Promise.all([callerB, laterB])).toEqual(['token-b', 'token-b']);
		expect(getAccessToken).toHaveBeenCalledTimes(2);
	});
});
