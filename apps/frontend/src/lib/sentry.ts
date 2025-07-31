import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

// Client-side Sentry initialization with replay integration for user session recording
export function initSentry() {
	const dsn = env.PUBLIC_SENTRY_DSN;

	if (!dsn) {
		console.warn('Sentry DSN not configured');
		return;
	}

	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		enableLogs: true,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
		integrations: [
      Sentry.replayIntegration(),
      Sentry.feedbackIntegration({
        triggerLabel : "Feedback",
        submitButtonLabel: "Send Feedback",
        formTitle: "Send Feedback",
        colorScheme: "system"})
    ]
	});
}

// Server-side Sentry initialization without replay features (not applicable on server)
export function initSentryServer() {
	const dsn = env.PUBLIC_SENTRY_DSN;

	if (!dsn) {
		console.warn('Sentry DSN not configured');
		return;
	}

	Sentry.init({
		dsn,
		tracesSampleRate: 1,
		enableLogs: true
	});
}
