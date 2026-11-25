/**
 * The browser's backend bearer: the OIDC access token from Better Auth's `/get-access-token`,
 * which refreshes it with the provider when fewer than 5 s remain. Cached until then. Freshness
 * follows the server's clock: the expiry is shifted by the largest clock offset the response's
 * `Date` header allows (measured from send time), so the cache can only expire early. No `Date`,
 * no caching. A token already expired by that clock is rejected as an expired session: without a
 * refresh token Better Auth hands back the stale access token rather than an error.
 *
 * Pass `getToken` itself (one stable function) as the chat client's token; the client calls it
 * before every request. State is module-wide, so it outlives component remounts.
 *
 * Every fetch asserts the user the page was rendered for (`page.data.session.user.id`) in a header
 * the server checks: cookies are shared across tabs, so another tab may have signed in as someone
 * else since. The cached token and the request in flight are bound to that user too: once the
 * page's data names another user (or none), neither is handed out, and a token that arrives for
 * the previous user is not cached.
 */
import { page } from '$app/state';
import { authClient } from './client';

/** Better Auth's refresh buffer: once inside it, the call we make is the one that refreshes. */
const REFRESH_BUFFER_MS = 5_000;

interface CachedToken {
	token: string;
	/** Epoch ms; null when the provider gave no expiry, which is never reused. */
	expiresAt: number | null;
	/** The user it was fetched for. */
	userId: string;
}

/** `expired` is set when the session can no longer produce a token; the chat layout then offers sign-in. */
export const backendAuth = $state({ expired: false });

let cached: CachedToken | null = null;
let inFlight: { userId: string | undefined; promise: Promise<string> } | null = null;
let reload = () => location.reload();

const isFresh = (entry: CachedToken | null): entry is CachedToken =>
	entry?.expiresAt != null && entry.expiresAt - Date.now() > REFRESH_BUFFER_MS;

/** Never act as another account under this page's: re-render as whoever is signed in now. */
function accountChanged(): never {
	reload();
	throw new Error('The signed-in account changed. Reloading.');
}

async function fetchToken(expectedUserId: string | undefined): Promise<string> {
	if (!expectedUserId) return accountChanged();
	// The server checks the signed-in user against the header in the same request that yields the
	// token, so another tab's sign-in cannot slip in between.
	let sentAt = 0;
	let skew: number | null = null; // upper bound of server clock minus local clock, ms
	const request = () => {
		sentAt = Date.now();
		return authClient.getAccessToken(
			{ useAccountCookie: true },
			{
				headers: { 'x-slg-expected-user': expectedUserId },
				onResponse: ({ response }) => {
					// `Date` is floored to the second and was stamped after we sent the request.
					const serverDate = Date.parse(response.headers.get('date') ?? '');
					if (!Number.isNaN(serverDate)) skew = serverDate + 1_000 - sentAt;
				}
			}
		);
	};
	// Across tabs: the second tab's request then sees the first tab's rotated cookie, so the
	// server does not spend the same refresh token twice.
	const { data, error } = await (navigator.locks
		? navigator.locks.request('slg-backend-token', request)
		: request());
	// The page now shows someone else: this answer is not theirs, so get one that is.
	if (page.data.session?.user.id !== expectedUserId) return getToken();
	if (error) {
		if (error.code === 'ACCOUNT_CHANGED') return accountChanged();
		// 4xx: no session or account, or the refresh failed. A 5xx or 429 (rate limit) may pass; the
		// next request retries.
		if (error.status >= 500 || error.status === 429)
			throw new Error(`Access token request failed: ${error.status}`);
		backendAuth.expired = true;
		throw new Error('Your session has expired. Sign in again to continue.');
	}
	const rawExpiry = data.accessTokenExpiresAt;
	const expiresAt = rawExpiry ? +new Date(rawExpiry) - (skew ?? 0) : null;
	// Without a refresh token Better Auth returns the expired access token instead of an error;
	// treat it like a failed refresh so the sign-in prompt opens.
	if (expiresAt !== null && expiresAt <= Date.now()) {
		backendAuth.expired = true;
		throw new Error('Your session has expired. Sign in again to continue.');
	}
	cached = {
		token: data.accessToken,
		expiresAt: skew !== null ? expiresAt : null,
		userId: expectedUserId
	};
	backendAuth.expired = false;
	return data.accessToken;
}

/**
 * The backend token for the page's current user. Concurrent callers share one request, which is
 * never aborted: an abandoned refresh would still rotate the refresh token, and its cookie must
 * land. A request superseded by another user's runs on but leaves the slot to its successor.
 */
export function getToken(): Promise<string> {
	const userId: string | undefined = page.data.session?.user.id;
	if (isFresh(cached) && cached.userId === userId) return Promise.resolve(cached.token);
	if (!inFlight || inFlight.userId !== userId) {
		const promise: Promise<string> = fetchToken(userId).finally(() => {
			if (inFlight?.promise === promise) inFlight = null;
		});
		inFlight = { userId, promise };
	}
	return inFlight.promise;
}

/** Test seam: forget the cached token and request in flight; replace the reload. */
export function resetBackendToken(onAccountChange = () => location.reload()) {
	cached = null;
	inFlight = null;
	reload = onAccountChange;
	backendAuth.expired = false;
}
