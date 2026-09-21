import { json } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { getAuth } from '$lib/auth';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'no-store' };
const failure = (status: number, code: string) => json({ code }, { status, headers });

function tokenResponse(token: {
	accessToken?: string | null;
	accessTokenExpiresAt?: Date | string | number | null;
}) {
	const expiresAt = token.accessTokenExpiresAt && new Date(token.accessTokenExpiresAt);
	const usable =
		token.accessToken &&
		expiresAt &&
		Number.isFinite(expiresAt.getTime()) &&
		expiresAt.getTime() > Date.now();
	return usable
		? json({ accessToken: token.accessToken, expiresAt: expiresAt.toISOString() }, { headers })
		: failure(401, 'AUTH_REQUIRED');
}

function apiFailure(error: APIError) {
	const code = error.body?.code;
	if (code === 'FAILED_TO_GET_ACCESS_TOKEN') return failure(401, 'AUTH_REFRESH_FAILED');
	const authenticationMissing =
		error.statusCode === 401 ||
		code === 'ACCOUNT_NOT_FOUND' ||
		code === 'USER_ID_OR_SESSION_REQUIRED';
	if (authenticationMissing) return failure(401, 'AUTH_REQUIRED');
	console.error('Backend token lookup failed', { code, status: error.statusCode });
	return failure(503, 'AUTH_UNAVAILABLE');
}

function lookupFailure(error: unknown) {
	if (error instanceof APIError) return apiFailure(error);
	console.error('Backend token lookup failed unexpectedly');
	return failure(503, 'AUTH_UNAVAILABLE');
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') !== url.origin) return failure(403, 'ORIGIN_NOT_ALLOWED');
	try {
		const token = await getAuth().api.getAccessToken({
			headers: request.headers,
			body: { useAccountCookie: true }
		});
		return tokenResponse(token);
	} catch (error) {
		return lookupFailure(error);
	}
};
