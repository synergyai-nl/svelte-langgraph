import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';

export function initSentry({ server = false }: { server?: boolean } = {}) {
	const dsn = env.PUBLIC_SENTRY_DSN;

	if (!dsn) {
		console.warn('Sentry DSN not configured');
		return;
	}

	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		/**
		 * sendDefaultPii allows capturing user info (IP, browser data, etc).
		 * Default to `true` in dev mode for easier debugging,
		 * and can be overridden via PUBLIC_SENTRY_SEND_PII.
		 */
		sendDefaultPii:
			env.PUBLIC_SENTRY_SEND_PII === 'true' || (env.PUBLIC_SENTRY_SEND_PII === undefined && dev),
		enableLogs: true,
		...(server
			? {
					integrations: [
						// send console.log, console.warn, and console.error calls as logs to Sentry
						Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error', 'info'] })
					]
				}
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
						}),
						// send console.log, console.warn, and console.error calls as logs to Sentry
						Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error', 'info'] })
					]
				})
	});
}
