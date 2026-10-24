import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backendAuth, getToken, resetBackendToken } from './backendToken.svelte';
import { SKEW_MS } from './tokenSkew';

const inMs = (ms: number) => Date.now() + ms;
const tokenResponse = (accessToken: string, expiresAt: number | null = inMs(3_600_000)) =>
	new Response(JSON.stringify({ accessToken, expiresAt }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	resetBackendToken();
	fetchMock = vi.fn().mockImplementation(async () => tokenResponse('fetched'));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('getToken', () => {
	test('caches a fetched token until it enters the skew window', async () => {
		expect(await getToken()).toBe('fetched');
		expect(await getToken()).toBe('fetched');

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/backend-token', { method: 'POST' });
	});

	test.each([
		['inside the skew window', SKEW_MS - 1000],
		['without an expiry', null]
	])('asks again, once per call, for a token %s', async (_, lifetime) => {
		fetchMock.mockImplementation(async () => tokenResponse('t', lifetime && inMs(lifetime)));

		await getToken();
		await getToken();

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('concurrent callers share one request, which carries no abort signal', async () => {
		let release!: (response: Response) => void;
		fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const calls = [getToken(), getToken(), getToken()];
		release(tokenResponse('shared'));

		expect(await Promise.all(calls)).toEqual(['shared', 'shared', 'shared']);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('signal');
	});

	test('holds a cross-tab lock around the request when available', async () => {
		const request = vi.fn((_name: string, callback: () => Promise<Response>) => callback());
		vi.stubGlobal('navigator', { locks: { request } });

		expect(await getToken()).toBe('fetched');
		expect(request).toHaveBeenCalledWith('slg-backend-token', expect.any(Function));
	});

	test.each(['AUTH_REQUIRED', 'AUTH_REFRESH_FAILED'])(
		'a 401 (%s) flags the session as expired and fails the request',
		async (code) => {
			fetchMock.mockImplementation(
				async () => new Response(JSON.stringify({ code }), { status: 401 })
			);

			await expect(getToken()).rejects.toThrow(/session has expired/);
			expect(backendAuth.expired).toBe(true);

			fetchMock.mockImplementation(async () => tokenResponse('again'));
			expect(await getToken()).toBe('again');
			expect(backendAuth.expired).toBe(false);
		}
	);

	test('a 503 or network error fails the request without flagging the session', async () => {
		fetchMock.mockImplementation(async () => new Response('{}', { status: 503 }));
		await expect(getToken()).rejects.toThrow('503');

		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(getToken()).rejects.toThrow('Failed to fetch');

		expect(backendAuth.expired).toBe(false);
	});
});
