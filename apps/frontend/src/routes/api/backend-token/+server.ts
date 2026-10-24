import { json } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { getAuth } from '$lib/auth';
import { SKEW_MS } from '$lib/auth/tokenSkew';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'no-store' };
const failure = (status: number, code: string) => json({ code }, { status, headers });
// Better Auth error codes: a refresh that cannot succeed, and a request with no session/account.
const REFRESH_FAILED = [
	'FAILED_TO_GET_ACCESS_TOKEN',
	'FAILED_TO_REFRESH_ACCESS_TOKEN',
	'REFRESH_TOKEN_NOT_FOUND',
	'TOKEN_REFRESH_NOT_SUPPORTED'
];
const SIGNED_OUT = ['ACCOUNT_NOT_FOUND', 'USER_ID_OR_SESSION_REQUIRED'];

function lookupFailure(error: unknown) {
	const code = error instanceof APIError ? (error.body?.code ?? '') : undefined;
	if (error instanceof APIError && code !== undefined) {
		if (REFRESH_FAILED.includes(code)) return failure(401, 'AUTH_REFRESH_FAILED');
		if (SIGNED_OUT.includes(code) || error.statusCode === 401) return failure(401, 'AUTH_REQUIRED');
	}
	// Never log the error object: it may carry token material.
	console.error('Backend token lookup failed', { code });
	return failure(503, 'AUTH_UNAVAILABLE');
}

const expiryOf = (date: Date | string | number | null | undefined) =>
	date ? new Date(date).getTime() : null;

/**
 * The browser's bearer for the backend: the OIDC access token from the account cookie, refreshed
 * when it is within SKEW_MS of expiry. Better Auth writes the rotated cookie through
 * `sveltekitCookies`. The refresh and ID tokens never leave the server.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Direct auth.api calls skip Better Auth's origin check. Compare with the configured public
	// origin, not the request URL, which is the internal one behind a TLS-terminating proxy.
	const allowed = env.BETTER_AUTH_URL && new URL(env.BETTER_AUTH_URL).origin;
	if (!allowed || request.headers.get('origin') !== allowed)
		return failure(403, 'ORIGIN_NOT_ALLOWED');
	const userId = locals.user?.id;
	if (!userId) return failure(401, 'AUTH_REQUIRED');
	try {
		const auth = await getAuth();
		const options = { headers: request.headers, body: { useAccountCookie: true as const } };
		const current = await auth.api.getAccessToken(options);
		const expiresAt = expiryOf(current.accessTokenExpiresAt);
		// Use the refresh result itself: re-reading would see the old cookie in these headers.
		const { accessToken, accessTokenExpiresAt } =
			expiresAt !== null && expiresAt - Date.now() < SKEW_MS
				? await auth.api.refreshToken(options).catch((error) => {
						// Better Auth reports a revoked refresh token and a provider outage alike, so
						// keep serving a token that has not expired; the browser asks again next request.
						if (expiresAt <= Date.now()) throw error;
						console.warn('Token refresh failed; serving the unexpired access token');
						return current;
					})
				: current;
		if (!accessToken) return failure(401, 'AUTH_REQUIRED');
		// The user id lets the browser notice that another tab switched accounts.
		return json({ accessToken, expiresAt: expiryOf(accessTokenExpiresAt), userId }, { headers });
	} catch (error) {
		return lookupFailure(error);
	}
};
