import * as Sentry from '@sentry/sveltekit';
import { PUBLIC_SENTRY_DSN, PUBLIC_SENTRY_SEND_PII } from '$app/env/public';
import { dev } from '$app/env';

// Sentry 11 migration guide: "If you want to keep the v10 default behavior"
const restrictiveDataCollection: NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection'] =
	{
		userInfo: false,
		cookies: false,
		httpHeaders: {
			request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
			response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] }
		},
		httpBodies: [],
		urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
		genAI: { inputs: false, outputs: false },
		databaseQueryData: false,
		queues: false,
		graphQL: { document: false, variables: false }
	};

export function initSentry({ server = false }: { server?: boolean } = {}) {
	const dsn = PUBLIC_SENTRY_DSN;
	const sendPii =
		PUBLIC_SENTRY_SEND_PII === 'true' || (PUBLIC_SENTRY_SEND_PII === undefined && dev);

	if (!dsn) {
		console.warn('Sentry DSN not configured');
		return;
	}

	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		/**
		 * Sentry 11 replaced `sendDefaultPii` with `dataCollection`, whose unset default is permissive
		 * (user info, cookies, bodies, ...). Collect everything by default in dev (or when
		 * PUBLIC_SENTRY_SEND_PII=true); otherwise use the restrictive baseline that matches the
		 * v10 default (`sendDefaultPii: false`).
		 */
		...(sendPii ? {} : { dataCollection: restrictiveDataCollection }),
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
							messagePlaceholder:
								"Share your experience - what's working great, or what could be better?",
							colorScheme: 'system',
							autoInject: false
						}),
						// send console.log, console.warn, and console.error calls as logs to Sentry
						Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error', 'info'] })
					]
				})
	});
}
