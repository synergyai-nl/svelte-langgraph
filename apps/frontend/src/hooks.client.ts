import { handleErrorWithSentry } from '@sentry/sveltekit';
import { initSentry } from '#lib/sentry.ts';

initSentry({ server: false });

export const handleError = handleErrorWithSentry();
