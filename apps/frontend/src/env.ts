import { defineEnvVars } from '@sveltejs/kit/env';

// Optional on purpose: callers fall back (`?? ''`, a "Sentry DSN not configured" warning, PII default from `dev`).
export const variables = defineEnvVars({
	PUBLIC_LANGGRAPH_API_URL: { public: true, schema: (input) => input },
	PUBLIC_SENTRY_DSN: { public: true, schema: (input) => input },
	PUBLIC_SENTRY_SEND_PII: { public: true, schema: (input) => input },
	// Optional in the schema because the build imports the auth module with no runtime settings;
	// requiredness is enforced in `src/lib/auth/index.ts`.
	BETTER_AUTH_SECRET: { schema: (input) => input },
	AUTH_OIDC_ISSUER: { schema: (input) => input },
	AUTH_OIDC_CLIENT_ID: { schema: (input) => input },
	AUTH_OIDC_CLIENT_SECRET: { schema: (input) => input },
	AUTH_OIDC_SCOPES: { schema: (input) => input },
	AUTH_OIDC_AUDIENCE: { schema: (input) => input },
	AUTH_RATE_LIMIT: { schema: (input) => input }
});
