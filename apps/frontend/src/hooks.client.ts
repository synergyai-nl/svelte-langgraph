import { handleErrorWithSentry } from '@sentry/sveltekit';
import { initSentry } from '$lib/sentry';

initSentry({ server: false });

export const handleError = handleErrorWithSentry();
