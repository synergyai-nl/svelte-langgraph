/**
 * The browser's backend bearer: the OIDC access token from Better Auth's `/get-access-token`,
 * which refreshes it with the provider when fewer than 5 s remain. Cached until then.
 *
 * Pass `getToken` itself (one stable function) as the chat client's token; the client calls it
 * before every request. State is module-wide, so it outlives component remounts.
 */
import { authClient } from './client';

/** Better Auth's refresh buffer: once inside it, the call we make is the one that refreshes. */
const REFRESH_BUFFER_MS = 5_000;

interface CachedToken {
	token: string;
	/** The JWT's subject, to notice another tab switching accounts. */
	sub: string;
	/** Epoch ms; null when the provider gave no expiry, which is never reused. */
	expiresAt: number | null;
}

/** `expired` is set when the session can no longer produce a token; the chat layout then offers sign-in. */
export const backendAuth = $state({ expired: false });

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;
let reload = () => location.reload();

const isFresh = (entry: CachedToken | null): entry is CachedToken =>
	entry?.expiresAt != null && entry.expiresAt - Date.now() > REFRESH_BUFFER_MS;

/** The backend only accepts JWT access tokens, so the subject is in the payload. */
const subjectOf = (jwt: string): string =>
	JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;

async function fetchToken(): Promise<string> {
	const request = () => authClient.getAccessToken({ useAccountCookie: true });
	// Across tabs: the second tab's request then sees the first tab's rotated cookie, so the
	// server does not spend the same refresh token twice.
	const { data, error } = await (navigator.locks
		? navigator.locks.request('slg-backend-token', request)
		: request());
	if (error) {
		// 4xx: no session or account, or the refresh failed. A 5xx may pass; the next request retries.
		if (error.status >= 500) throw new Error(`Access token request failed: ${error.status}`);
		backendAuth.expired = true;
		throw new Error('Your session has expired. Sign in again to continue.');
	}
	const sub = subjectOf(data.accessToken);
	if (cached && cached.sub !== sub) {
		// Never act as the new account under the old one's page: re-render as the new account.
		reload();
		throw new Error('The signed-in account changed. Reloading.');
	}
	const expiresAt = data.accessTokenExpiresAt;
	cached = { token: data.accessToken, sub, expiresAt: expiresAt ? +new Date(expiresAt) : null };
	backendAuth.expired = false;
	return data.accessToken;
}

/**
 * The current backend token. Concurrent callers share one request, which is never aborted: an
 * abandoned refresh would still rotate the refresh token, and its cookie must land.
 */
export function getToken(): Promise<string> {
	if (isFresh(cached)) return Promise.resolve(cached.token);
	inFlight ??= fetchToken().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

/** Test seam: forget the cached token and request in flight; replace the reload. */
export function resetBackendToken(onAccountChange = () => location.reload()) {
	cached = null;
	inFlight = null;
	reload = onAccountChange;
	backendAuth.expired = false;
}
