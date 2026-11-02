/**
 * The browser's backend bearer: the OIDC access token from Better Auth's `/get-access-token`,
 * which refreshes it with the provider when fewer than 5 s remain. Cached until then.
 *
 * Pass `getToken` itself (one stable function) as the chat client's token; the client calls it
 * before every request. State is module-wide, so it outlives component remounts.
 *
 * Every fetch asserts the user the page was rendered for (`page.data.session.user.id`) in a header
 * the server checks: cookies are shared across tabs, so another tab may have signed in as someone
 * else since.
 */
import { page } from '$app/state';
import { authClient } from './client';

/** Better Auth's refresh buffer: once inside it, the call we make is the one that refreshes. */
const REFRESH_BUFFER_MS = 5_000;

interface CachedToken {
	token: string;
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

/** Never act as another account under this page's: re-render as whoever is signed in now. */
function accountChanged(): never {
	reload();
	throw new Error('The signed-in account changed. Reloading.');
}

async function fetchToken(): Promise<string> {
	const expectedUserId: string | undefined = page.data.session?.user.id;
	if (!expectedUserId) return accountChanged();
	// The server checks the signed-in user against the header in the same request that yields the
	// token, so another tab's sign-in cannot slip in between.
	const request = () =>
		authClient.getAccessToken(
			{ useAccountCookie: true },
			{ headers: { 'x-slg-expected-user': expectedUserId } }
		);
	// Across tabs: the second tab's request then sees the first tab's rotated cookie, so the
	// server does not spend the same refresh token twice.
	const { data, error } = await (navigator.locks
		? navigator.locks.request('slg-backend-token', request)
		: request());
	if (error) {
		if (error.code === 'ACCOUNT_CHANGED') return accountChanged();
		// 4xx: no session or account, or the refresh failed. A 5xx or 429 (rate limit) may pass; the
		// next request retries.
		if (error.status >= 500 || error.status === 429)
			throw new Error(`Access token request failed: ${error.status}`);
		backendAuth.expired = true;
		throw new Error('Your session has expired. Sign in again to continue.');
	}
	const expiresAt = data.accessTokenExpiresAt;
	cached = { token: data.accessToken, expiresAt: expiresAt ? +new Date(expiresAt) : null };
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
