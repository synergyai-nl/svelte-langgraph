import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

export function initSentry({ server = false }: { server?: boolean } = {}) {
	const dsn = env.PUBLIC_SENTRY_DSN;

	if (!dsn) {
		console.warn('Sentry DSN not configured');
		return;
	}

	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		enableLogs: true,
		...(server
			? {}
			: {
					replaysSessionSampleRate: 0.1,
					replaysOnErrorSampleRate: 1.0,
					integrations: [
						Sentry.replayIntegration(),
						Sentry.feedbackIntegration({
							triggerLabel: 'Feedback',
							submitButtonLabel: 'Send Feedback',
							formTitle: 'Send Feedback',
							colorScheme: 'system'
						})
					]
				})
	});
}
