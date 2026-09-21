import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session =
		event.locals.session && event.locals.user
			? {
					user: {
						name: event.locals.user.name,
						email: event.locals.user.email,
						image: event.locals.user.image
					}
				}
			: null;

	return {
		session,
		// Default to open: only an explicit "false" cookie collapses the sidebar, so a first-time
		// visitor (no cookie) gets the sidebar and there is no open/closed flash on hydration.
		sidebarOpen: event.cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
