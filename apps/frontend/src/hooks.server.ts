import * as Sentry from '@sentry/sveltekit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { auth } from '#lib/auth/index.ts';
import { initSentry } from '#lib/sentry.ts';

initSentry({ server: true });

const handleParaglide: Handle = ({ event, resolve }) =>
	// SvelteKit 3 makes `event.request` readonly: pass the middleware's request on a copy of the event.
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale) }
		)
	);

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = building ? null : await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;
	return svelteKitHandler({ event, resolve, auth, building });
};

// Chain the handles using sequence
export const handle: Handle = sequence(Sentry.sentryHandle(), handleParaglide, handleAuth);
export const handleError = Sentry.handleErrorWithSentry();
