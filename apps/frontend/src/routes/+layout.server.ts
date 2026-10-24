import { auth } from '$lib/auth';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import type { LayoutServerLoad } from './$types';

/**
 * The backend verifies the OIDC access token (a JWT for the API audience), so that is the bearer exposed to the chat client as
 * `session.accessToken`, with its expiry (epoch ms) to seed the browser's token cache. Better Auth
 * refreshes it when needed and rewrites its cookies via `sveltekitCookies`; the browser gets later
 * tokens from `/api/backend-token`.
 */
async function loadBearer(
	event: Parameters<LayoutServerLoad>[0]
): Promise<{ accessToken: string; accessTokenExpiresAt: number | null } | null> {
	try {
		const tokens = await auth.api.getAccessToken({
			headers: event.request.headers,
			body: { useAccountCookie: true }
		});
		if (!tokens.accessToken) return null;
		const expiresAt = tokens.accessTokenExpiresAt;
		return {
			accessToken: tokens.accessToken,
			accessTokenExpiresAt: expiresAt ? new Date(expiresAt).getTime() : null
		};
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
					...bearer
				}
			: null;

	return {
		session,
		// Default to open: only an explicit "false" cookie collapses the sidebar, so a first-time
		// visitor (no cookie) gets the sidebar and there is no open/closed flash on hydration.
		sidebarOpen: event.cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
