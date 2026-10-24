import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { error, type Handle } from '@sveltejs/kit';

const WEEK = 7 * 24 * 60 * 60;

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Required environment variable '${name}' not defined.`);
	return value;
}

function createAuth() {
	const issuer = required('AUTH_OIDC_ISSUER');
	return betterAuth({
		baseURL: required('BETTER_AUTH_URL'),
		secret: required('BETTER_AUTH_SECRET'),
		// Provider tokens stay server-side: the root layout reads them via auth.api, not HTTP.
		disabledPaths: ['/get-access-token', '/refresh-token'],
		// Rate limiting belongs at the proxy, which knows the client IP.
		rateLimit: { enabled: false },
		session: {
			// Stateless sessions end a week after sign-in; refreshCache only re-issues the cookie.
			expiresIn: WEEK,
			cookieCache: { enabled: true, maxAge: WEEK, strategy: 'jwe', refreshCache: true }
		},
		account: { storeStateStrategy: 'cookie', storeAccountCookie: true },
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: 'oidc',
						discoveryUrl: `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
						clientId: required('AUTH_OIDC_CLIENT_ID'),
						clientSecret: required('AUTH_OIDC_CLIENT_SECRET'),
						scopes: (env.AUTH_OIDC_SCOPES ?? 'openid profile email offline_access')
							.split(/\s+/)
							.filter(Boolean),
						// Sign-out ends the local session only, as before; no redirect to the provider.
						disableProviderLogout: true,
						requireIdTokenVerification: true,
						pkce: true,
						// Send the client secret as HTTP Basic, as Auth.js did.
						authentication: 'basic'
					}
				]
			}),
			sveltekitCookies(getRequestEvent)
		]
	});
}

// Configuration is process-wide; sessions and token lookups remain request-local.
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
	if (auth) return auth;
	const created = (auth = createAuth());
	// OIDC discovery runs once, at init, and Better Auth skips a provider it could not reach.
	// Forget such an instance so a later request retries instead of sign-in staying broken.
	const forget = () => {
		if (auth === created) auth = undefined;
	};
	created.$context.then((ctx) => {
		if (!ctx.socialProviders.some((provider) => provider.id === 'oidc')) forget();
	}, forget);
	return created;
}
export type Auth = ReturnType<typeof getAuth>;

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);
	let auth: Auth;
	try {
		auth = getAuth();
	} catch {
		console.error('Authentication configuration is unavailable');
		error(503, 'Authentication is temporarily unavailable');
	}
	// Route on the path alone: behind a proxy, event.url may not carry the BETTER_AUTH_URL origin.
	if (event.url.pathname.startsWith('/api/auth/')) return auth.handler(event.request);
	let session: Auth['$Infer']['Session'] | null;
	try {
		session = await auth.api.getSession({ headers: event.request.headers });
	} catch {
		console.error('Authentication session lookup is unavailable');
		error(503, 'Authentication is temporarily unavailable');
	}
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;
	return resolve(event);
};
