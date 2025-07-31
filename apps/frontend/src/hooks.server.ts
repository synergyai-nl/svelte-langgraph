import * as Sentry from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { handle as handleAuth } from './auth';
import { initSentryServer } from '$lib/sentry';

initSentryServer();

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

// Chain the handles using sequence
export const handle: Handle = sequence(
	Sentry.sentryHandle(),
	sequence(handleParaglide, handleAuth)
);
export const handleError = Sentry.handleErrorWithSentry();
