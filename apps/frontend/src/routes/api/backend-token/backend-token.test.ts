import { describe, expect, test, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import { POST } from './+server';

const getAccessToken = vi.hoisted(() => vi.fn());
vi.mock('$lib/auth', () => ({ getAuth: () => ({ api: { getAccessToken } }) }));
const url = new URL('https://frontend.test/api/backend-token');
const request = (origin = url.origin) =>
	POST({
		request: new Request(url, { method: 'POST', headers: { origin, cookie: 'opaque=session' } }),
		url
	} as Parameters<typeof POST>[0]);

describe('backend token endpoint', () => {
	test('selects only the session account, returns expiry and never the refresh or ID token', async () => {
		const expiry = new Date(Date.now() + 60000);
		getAccessToken.mockResolvedValue({
			accessToken: 'api-token',
			accessTokenExpiresAt: expiry,
			refreshToken: 'private',
			idToken: 'id-token'
		});
		const response = await request();
		expect(await response.json()).toEqual({
			accessToken: 'api-token',
			expiresAt: expiry.toISOString()
		});
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(getAccessToken).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: { useAccountCookie: true }
		});
	});
	test('refuses a cross-origin request before consulting the session', async () => {
		expect((await request('https://other.test')).status).toBe(403);
		expect(getAccessToken).not.toHaveBeenCalled();
	});
	test.each([undefined, new Date(0), new Date('invalid')])(
		'rejects unusable expiry %s',
		async (expiry) => {
			getAccessToken.mockResolvedValue({ accessToken: 'old', accessTokenExpiresAt: expiry });
			const response = await request();
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ code: 'AUTH_REQUIRED' });
		}
	);
	test.each([
		['ACCOUNT_NOT_FOUND', 'BAD_REQUEST', 401, 'AUTH_REQUIRED'],
		['FAILED_TO_GET_ACCESS_TOKEN', 'BAD_REQUEST', 401, 'AUTH_REFRESH_FAILED'],
		['UNAUTHORIZED', 'UNAUTHORIZED', 401, 'AUTH_REQUIRED'],
		['PROVIDER_NOT_SUPPORTED', 'BAD_REQUEST', 503, 'AUTH_UNAVAILABLE']
	] as const)('classifies %s', async (code, status, expectedStatus, expectedCode) => {
		getAccessToken.mockRejectedValue(new APIError(status, { code }));
		const response = await request();
		expect(response.status).toBe(expectedStatus);
		expect(await response.json()).toEqual({ code: expectedCode });
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
