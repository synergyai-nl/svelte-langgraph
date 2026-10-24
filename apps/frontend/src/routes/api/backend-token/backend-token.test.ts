import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import { SKEW_MS } from '$lib/auth/tokenSkew';
import { POST } from './+server';

const api = vi.hoisted(() => ({ getAccessToken: vi.fn(), refreshToken: vi.fn() }));
vi.mock('$lib/auth', () => ({ getAuth: async () => ({ api }) }));
const env = vi.hoisted(
	() => ({ BETTER_AUTH_URL: 'https://public.test' }) as Record<string, string>
);
vi.mock('$env/dynamic/private', () => ({ env }));

const locals = { user: { id: 'user-a' } as { id: string } | null };

function post(origin: string | null = 'https://public.test', at = 'https://public.test') {
	const headers: Record<string, string> = { cookie: 'opaque=session' };
	if (origin) headers.origin = origin;
	const request = new Request(`${at}/api/backend-token`, { method: 'POST', headers });
	return POST({ request, locals } as unknown as Parameters<typeof POST>[0]);
}

const inMs = (ms: number) => new Date(Date.now() + ms);

beforeEach(() => {
	api.getAccessToken.mockReset();
	api.refreshToken.mockReset();
	env.BETTER_AUTH_URL = 'https://public.test';
	locals.user = { id: 'user-a' };
	api.getAccessToken.mockResolvedValue({ accessToken: 'a', accessTokenExpiresAt: inMs(3_600_000) });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('backend token endpoint', () => {
	test('returns a fresh token without refreshing, and never the refresh or ID token', async () => {
		const expiry = inMs(SKEW_MS + 60_000);
		api.getAccessToken.mockResolvedValue({
			accessToken: 'api-token',
			accessTokenExpiresAt: expiry,
			refreshToken: 'private-refresh',
			idToken: 'private-id'
		});

		const response = await post();

		expect(await response.json()).toEqual({
			accessToken: 'api-token',
			expiresAt: expiry.getTime(),
			userId: 'user-a'
		});
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(api.getAccessToken).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: { useAccountCookie: true }
		});
		expect(api.refreshToken).not.toHaveBeenCalled();
	});

	test('refreshes once inside the skew and returns only the new access token', async () => {
		api.getAccessToken.mockResolvedValue({
			accessToken: 'old',
			accessTokenExpiresAt: inMs(SKEW_MS - 1000)
		});
		const expiry = inMs(3_600_000);
		api.refreshToken.mockResolvedValue({
			accessToken: 'new',
			accessTokenExpiresAt: expiry,
			refreshToken: 'private-refresh',
			idToken: 'private-id'
		});

		const response = await post();
		const body = await response.json();

		expect(body).toEqual({ accessToken: 'new', expiresAt: expiry.getTime(), userId: 'user-a' });
		expect(JSON.stringify(body)).not.toContain('private');
		expect(api.refreshToken).toHaveBeenCalledExactlyOnceWith({
			headers: expect.any(Headers),
			body: { useAccountCookie: true }
		});
		expect(api.getAccessToken).toHaveBeenCalledOnce();
	});

	test('refreshes an expired token', async () => {
		api.getAccessToken.mockResolvedValue({ accessToken: 'old', accessTokenExpiresAt: new Date(0) });
		api.refreshToken.mockResolvedValue({ accessToken: 'new', accessTokenExpiresAt: inMs(60_000) });

		expect((await (await post()).json()).accessToken).toBe('new');
	});

	test('passes on a token without an expiry, which the browser then does not cache', async () => {
		api.getAccessToken.mockResolvedValue({ accessToken: 'a' });

		expect(await (await post()).json()).toMatchObject({ accessToken: 'a', expiresAt: null });
		expect(api.refreshToken).not.toHaveBeenCalled();
	});

	describe('origin', () => {
		test.each([['https://other.test'], [null], ['http://public.test']])(
			'refuses %s before consulting the session',
			async (origin) => {
				const response = await post(origin);
				expect(response.status).toBe(403);
				expect(api.getAccessToken).not.toHaveBeenCalled();
			}
		);

		test('accepts the public origin behind a TLS proxy that forwards to an internal URL', async () => {
			expect((await post('https://public.test', 'http://internal:3000')).status).toBe(200);
		});

		test('compares origins, not the configured path', async () => {
			env.BETTER_AUTH_URL = 'https://public.test/app/';
			expect((await post()).status).toBe(200);
		});
	});

	test('refuses a request without a signed-in user before reading the account', async () => {
		locals.user = null;
		const response = await post();
		expect(await response.json()).toEqual({ code: 'AUTH_REQUIRED' });
		expect(api.getAccessToken).not.toHaveBeenCalled();
	});

	test.each([
		['ACCOUNT_NOT_FOUND', 'BAD_REQUEST', 401, 'AUTH_REQUIRED'],
		['UNAUTHORIZED', 'UNAUTHORIZED', 401, 'AUTH_REQUIRED'],
		['FAILED_TO_GET_ACCESS_TOKEN', 'BAD_REQUEST', 401, 'AUTH_REFRESH_FAILED'],
		['PROVIDER_NOT_SUPPORTED', 'BAD_REQUEST', 503, 'AUTH_UNAVAILABLE']
	] as const)('maps a lookup failure %s', async (code, status, expectedStatus, expectedCode) => {
		api.getAccessToken.mockRejectedValue(new APIError(status, { code }));

		const response = await post();

		expect(response.status).toBe(expectedStatus);
		expect(await response.json()).toEqual({ code: expectedCode });
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	test.each([
		['FAILED_TO_REFRESH_ACCESS_TOKEN', 401, 'AUTH_REFRESH_FAILED'],
		['REFRESH_TOKEN_NOT_FOUND', 401, 'AUTH_REFRESH_FAILED']
	] as const)('maps a refresh failure %s', async (code, expectedStatus, expectedCode) => {
		api.getAccessToken.mockResolvedValue({ accessToken: 'old', accessTokenExpiresAt: new Date(0) });
		api.refreshToken.mockRejectedValue(new APIError('BAD_REQUEST', { code }));

		const response = await post();

		expect(response.status).toBe(expectedStatus);
		expect(await response.json()).toEqual({ code: expectedCode });
	});

	test('serves the current token when a refresh fails before it expires', async () => {
		const expiry = inMs(SKEW_MS - 1000);
		api.getAccessToken.mockResolvedValue({ accessToken: 'old', accessTokenExpiresAt: expiry });
		api.refreshToken.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'secret' }));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const response = await post();

		expect(await response.json()).toMatchObject({
			accessToken: 'old',
			expiresAt: expiry.getTime()
		});
		expect(warn).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining('secret'));
	});

	test('maps an unexpected failure to 503 without logging the error', async () => {
		api.getAccessToken.mockRejectedValue(new Error('secret-token-material'));

		const response = await post();

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'AUTH_UNAVAILABLE' });
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret');
	});
});
