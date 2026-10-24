import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backendAuth, getToken, resetBackendToken } from './backendToken.svelte';

const getAccessToken = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ authClient: { getAccessToken } }));

const base64url = (value: string) =>
	btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
/** A JWT-shaped token; only the payload's `sub` matters to the browser. */
const jwt = (sub: string, nonce = '') => `h.${base64url(JSON.stringify({ sub, nonce }))}.s`;
const inMs = (ms: number) => new Date(Date.now() + ms);
const ok = (accessToken: string, accessTokenExpiresAt: Date | null = inMs(3_600_000)) => ({
	data: { accessToken, accessTokenExpiresAt, scopes: [], idToken: 'private-id' },
	error: null
});
const failed = (status: number) => ({ data: null, error: { status, statusText: 'x' } });

const reload = vi.fn();
const token = jwt('user-a');

beforeEach(() => {
	reload.mockReset();
	resetBackendToken(reload);
	getAccessToken.mockReset().mockResolvedValue(ok(token));
});

afterEach(() => vi.unstubAllGlobals());

describe('getToken', () => {
	test('caches a token until it enters Better Auth’s refresh buffer', async () => {
		expect(await getToken()).toBe(token);
		expect(await getToken()).toBe(token);

		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({ useAccountCookie: true });
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
		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({ useAccountCookie: true });
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

	test('a 5xx or network error fails the request without flagging the session', async () => {
		getAccessToken.mockResolvedValue(failed(503));
		await expect(getToken()).rejects.toThrow('503');

		getAccessToken.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(getToken()).rejects.toThrow('Failed to fetch');

		expect(backendAuth.expired).toBe(false);
	});

	test('a token for another subject reloads the page and is neither returned nor cached', async () => {
		getAccessToken.mockResolvedValue(ok(token, inMs(1_000)));
		await getToken();
		getAccessToken.mockResolvedValue(ok(jwt('user-b')));

		await expect(getToken()).rejects.toThrow(/account changed/);
		await expect(getToken()).rejects.toThrow(/account changed/);
		expect(getAccessToken).toHaveBeenCalledTimes(3);
		expect(reload).toHaveBeenCalledTimes(2);
	});

	test('a refreshed token for the same subject replaces the cached one without a reload', async () => {
		getAccessToken.mockResolvedValue(ok(token, inMs(1_000)));
		await getToken();
		const refreshed = jwt('user-a', 'refreshed');
		getAccessToken.mockResolvedValue(ok(refreshed));

		expect(await getToken()).toBe(refreshed);
		expect(await getToken()).toBe(refreshed);
		expect(getAccessToken).toHaveBeenCalledTimes(2);
		expect(reload).not.toHaveBeenCalled();
	});
});
