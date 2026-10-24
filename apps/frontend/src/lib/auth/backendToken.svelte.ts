/**
 * The browser's backend bearer: the OIDC access token, cached until it is within SKEW_MS of
 * expiry and then fetched from `/api/backend-token`, which refreshes it with the provider.
 *
 * Pass `getToken` itself (one stable function) as the chat client's token; the client calls it
 * before every request. State is module-wide, so it outlives component remounts.
 */
import { SKEW_MS } from './tokenSkew';

interface CachedToken {
	token: string;
	/** Epoch ms; null when the provider gave no expiry, which is never cached. */
	expiresAt: number | null;
}

/** `expired` is set when the session can no longer produce a token; the chat layout then offers sign-in. */
export const backendAuth = $state({ expired: false });

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

const isFresh = (entry: CachedToken | null): entry is CachedToken =>
	entry?.expiresAt != null && entry.expiresAt - Date.now() > SKEW_MS;

async function fetchToken(): Promise<string> {
	const request = () => fetch('/api/backend-token', { method: 'POST' });
	// Across tabs: the second tab's request then sees the first tab's rotated cookie, so the
	// server does not spend the same refresh token twice.
	const response = await (navigator.locks
		? navigator.locks.request('slg-backend-token', request)
		: request());
	if (response.status === 401) {
		backendAuth.expired = true;
		throw new Error('Your session has expired. Sign in again to continue.');
	}
	if (!response.ok) throw new Error(`Backend token request failed: ${response.status}`);
	const { accessToken, expiresAt } = (await response.json()) as {
		accessToken: string;
		expiresAt: number | null;
	};
	cached = { token: accessToken, expiresAt };
	backendAuth.expired = false;
	return accessToken;
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

/** Test seam: forget the cached token and any request in flight. */
export function resetBackendToken() {
	cached = null;
	inFlight = null;
	backendAuth.expired = false;
}
