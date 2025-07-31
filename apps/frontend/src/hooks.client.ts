import { handleErrorWithSentry } from '@sentry/sveltekit';
import { initSentry } from '$lib/sentry';

initSentry();

export const handleError = handleErrorWithSentry();
