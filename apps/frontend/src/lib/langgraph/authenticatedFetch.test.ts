import { afterEach, describe, expect, test, vi } from 'vitest';
import { createAuthenticatedFetch } from './authenticatedFetch';

const backendUrl = 'https://backend.test/api';
const freshToken = (token = 'fresh') =>
	Response.json({ accessToken: token, expiresAt: new Date(Date.now() + 60000).toISOString() });
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('authenticated backend transport', () => {
	test('shares concurrent lookups, but obtains a new token for the next request', async () => {
		const lookup = deferred<Response>();
		const nativeFetch = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input) =>
				input === '/api/backend-token' ? lookup.promise : new Response('ok')
			);
		const onAuthState = vi.fn();
		const transport = createAuthenticatedFetch({ backendUrl, fetch: nativeFetch, onAuthState });
		const first = transport.fetch(`${backendUrl}/threads`);
		const second = transport.fetch(`${backendUrl}/runs`);
		expect(nativeFetch).toHaveBeenCalledTimes(1);
		lookup.resolve(freshToken());
		await Promise.all([first, second]);
		expect(onAuthState).not.toHaveBeenCalled();
		const backendCalls = nativeFetch.mock.calls.filter(([request]) => request instanceof Request);
		expect(backendCalls).toHaveLength(2);
		for (const [request] of backendCalls) {
			expect((request as Request).headers.get('Authorization')).toBe('Bearer fresh');
			expect((request as Request).credentials).toBe('omit');
			expect((request as Request).redirect).toBe('error');
		}
		nativeFetch.mockImplementation(async (input) =>
			input === '/api/backend-token' ? freshToken('next') : new Response('ok')
		);
		await transport.fetch(`${backendUrl}/feedback`, { method: 'POST', body: '{}' });
		expect((nativeFetch.mock.calls.at(-1)![0] as Request).headers.get('Authorization')).toBe(
			'Bearer next'
		);
	});

	test('canceling one caller neither cancels another nor sends the canceled request', async () => {
		const lookup = deferred<Response>();
		const nativeFetch = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input) =>
				input === '/api/backend-token' ? lookup.promise : new Response('ok')
			);
		const transport = createAuthenticatedFetch({
			backendUrl,
			fetch: nativeFetch,
			onAuthState: vi.fn()
		});
		const controller = new AbortController();
		const first = transport.fetch(`${backendUrl}/threads`, { signal: controller.signal });
		const assertion = expect(first).rejects.toMatchObject({ name: 'AbortError' });
		const second = transport.fetch(`${backendUrl}/runs`);
		controller.abort();
		await assertion;
		lookup.resolve(freshToken());
		expect((await second).ok).toBe(true);
		expect(nativeFetch).toHaveBeenCalledTimes(2);
	});

	test.each([
		['AUTH_REQUIRED', 401],
		['AUTH_REFRESH_FAILED', 401],
		['AUTH_UNAVAILABLE', 503]
	] as const)(
		'returns %s without touching the backend and allows explicit retry',
		async (code, status) => {
			const nativeFetch = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(Response.json({ code }, { status }))
				.mockImplementation(async () => freshToken());
			const onAuthState = vi.fn();
			const transport = createAuthenticatedFetch({ backendUrl, fetch: nativeFetch, onAuthState });
			const result = await transport.fetch(`${backendUrl}/runs`, { method: 'POST' });
			expect(result.status).toBe(status);
			expect(nativeFetch).toHaveBeenCalledTimes(1);
			expect(onAuthState).toHaveBeenLastCalledWith(code);
			expect(await transport.retry()).toBe(true);
			expect(onAuthState).toHaveBeenLastCalledWith(null);
			expect(nativeFetch.mock.calls.every(([url]) => url === '/api/backend-token')).toBe(true);
		}
	);

	test.each([401, 403])('passes backend %i through without replay', async (status) => {
		const failure = new Response('rejected', { status });
		const nativeFetch = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(freshToken())
			.mockResolvedValueOnce(failure);
		const onAuthState = vi.fn();
		const transport = createAuthenticatedFetch({ backendUrl, fetch: nativeFetch, onAuthState });
		expect(await transport.fetch(`${backendUrl}/runs`, { method: 'POST' })).toBe(failure);
		expect(nativeFetch).toHaveBeenCalledTimes(2);
		if (status === 401) expect(onAuthState).toHaveBeenLastCalledWith('AUTH_REQUIRED');
		else expect(onAuthState).not.toHaveBeenCalled();
	});

	test.each(['invalid', new Date(0).toISOString()])(
		'rejects an unusable token expiry %s before contacting the backend',
		async (expiresAt) => {
			const nativeFetch = vi
				.fn<typeof fetch>()
				.mockResolvedValue(Response.json({ accessToken: 'old', expiresAt }));
			const transport = createAuthenticatedFetch({
				backendUrl,
				fetch: nativeFetch,
				onAuthState: vi.fn()
			});

			expect((await transport.fetch(`${backendUrl}/threads`)).status).toBe(503);
			expect(nativeFetch).toHaveBeenCalledOnce();
		}
	);

	test.each(['backend', 'refresh'] as const)(
		'keeps a %s failure visible across unrelated successful requests until explicit retry',
		async (source) => {
			const nativeFetch = vi.fn<typeof fetch>();
			if (source === 'backend') {
				nativeFetch
					.mockResolvedValueOnce(freshToken())
					.mockResolvedValueOnce(new Response('rejected', { status: 401 }));
			} else {
				nativeFetch.mockResolvedValueOnce(
					Response.json({ code: 'AUTH_REFRESH_FAILED' }, { status: 401 })
				);
			}
			nativeFetch.mockImplementation(async (input) =>
				input === '/api/backend-token' ? freshToken() : new Response('ok')
			);
			const onAuthState = vi.fn();
			const transport = createAuthenticatedFetch({ backendUrl, fetch: nativeFetch, onAuthState });
			expect((await transport.fetch(`${backendUrl}/runs`, { method: 'POST' })).status).toBe(401);
			expect((await transport.fetch(`${backendUrl}/threads`)).ok).toBe(true);
			expect(onAuthState.mock.calls).toEqual([
				[source === 'backend' ? 'AUTH_REQUIRED' : 'AUTH_REFRESH_FAILED']
			]);
			expect(await transport.retry()).toBe(true);
			expect(onAuthState).toHaveBeenLastCalledWith(null);
			const writes = nativeFetch.mock.calls.filter(
				([input]) => input instanceof Request && input.method === 'POST'
			);
			expect(writes).toHaveLength(source === 'backend' ? 1 : 0);
		}
	);

	test('refuses other origins and paths before obtaining credentials', async () => {
		const nativeFetch = vi.fn<typeof fetch>();
		const transport = createAuthenticatedFetch({
			backendUrl,
			fetch: nativeFetch,
			onAuthState: vi.fn()
		});
		await expect(transport.fetch('https://other.test/api/threads')).rejects.toThrow(
			/another destination/
		);
		await expect(transport.fetch('https://backend.test/api-other')).rejects.toThrow(
			/another destination/
		);
		expect(nativeFetch).not.toHaveBeenCalled();
	});

	test('allows a cookie-rotating token lookup to finish after five seconds', async () => {
		vi.useFakeTimers();
		const lookup = deferred<Response>();
		const nativeFetch = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input) =>
				input === '/api/backend-token' ? lookup.promise : new Response('ok')
			);
		const transport = createAuthenticatedFetch({
			backendUrl,
			fetch: nativeFetch,
			onAuthState: vi.fn()
		});
		const request = transport.fetch(`${backendUrl}/threads`);
		await vi.advanceTimersByTimeAsync(6000);
		expect(nativeFetch).toHaveBeenCalledTimes(1);
		lookup.resolve(freshToken());
		expect((await request).ok).toBe(true);
	});

	test('disposing the layout prevents late notifications or backend sends', async () => {
		const lookup = deferred<Response>();
		const nativeFetch = vi.fn<typeof fetch>().mockReturnValue(lookup.promise);
		const onAuthState = vi.fn();
		const transport = createAuthenticatedFetch({ backendUrl, fetch: nativeFetch, onAuthState });
		const request = transport.fetch(`${backendUrl}/threads`);
		const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
		transport.dispose();
		lookup.resolve(freshToken());
		await assertion;
		expect(onAuthState).not.toHaveBeenCalled();
		expect(nativeFetch).toHaveBeenCalledTimes(1);
	});
});
