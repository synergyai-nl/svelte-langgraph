import { auth } from '$lib/auth';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import type { LayoutServerLoad } from './$types';

/** Whether the JWT's `exp` is still in the future. No signature check: the token comes from our own encrypted cookie and the backend verifies it. */
function isUnexpired(jwt: string): boolean {
	try {
		const { exp } = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString());
		return typeof exp === 'number' && exp * 1000 > Date.now();
	} catch {
		return false;
	}
}

/**
 * The backend verifies the OIDC ID token, so that is the bearer exposed to the chat client as
 * `session.accessToken`. Better Auth refreshes it when needed and rewrites its cookies via
 * `sveltekitCookies`, but it keeps the old ID token when a refresh response has none and only
 * refreshes on access-token expiry. An expired (or undecodable) ID token is therefore treated as
 * signed out.
 */
async function loadBearer(event: Parameters<LayoutServerLoad>[0]): Promise<string | null> {
	try {
		const tokens = await auth.api.getAccessToken({
			headers: event.request.headers,
			body: { useAccountCookie: true }
		});
		return tokens.idToken && isUnexpired(tokens.idToken) ? tokens.idToken : null;
	} catch {
		// Never log the error object: it may carry token material.
		console.error('Authentication token lookup failed; treating the request as signed out');
		return null;
	}
}

export const load: LayoutServerLoad = async (event) => {
	const bearer = event.locals.session && event.locals.user ? await loadBearer(event) : null;
	const session =
		bearer && event.locals.user
			? {
					user: {
						// Better Auth stores '' for a missing name; consumers fall back on undefined.
						name: event.locals.user.name || undefined,
						email: event.locals.user.email,
						image: event.locals.user.image
					},
					accessToken: bearer
				}
			: null;

	return {
		session,
		// Default to open: only an explicit "false" cookie collapses the sidebar, so a first-time
		// visitor (no cookie) gets the sidebar and there is no open/closed flash on hydration.
		sidebarOpen: event.cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
