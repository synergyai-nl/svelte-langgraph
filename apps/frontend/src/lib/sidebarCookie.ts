import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';

/**
 * Parse the sidebar-open cookie out of a raw `document.cookie` string. Mirrors the server's
 * default-open policy (`+layout.server.ts`): only an explicit "false" collapses it.
 *
 * Returns `null` when the cookie is absent, so callers can fall back to server-provided data
 * (first visit, before any cookie has been written).
 */
export function parseSidebarCookie(cookieString: string): boolean | null {
	for (const pair of cookieString.split(';')) {
		const eq = pair.indexOf('=');
		if (eq === -1) continue;

		const name = pair.slice(0, eq).trim();
		if (name !== SIDEBAR_COOKIE_NAME) continue;

		const value = pair.slice(eq + 1).trim();
		return value !== 'false';
	}
	return null;
}
