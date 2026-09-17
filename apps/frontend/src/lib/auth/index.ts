import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { svelteKitHandler, sveltekitCookies } from 'better-auth/svelte-kit';
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
		disabledPaths: ['/refresh-token'],
		session: {
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
						requireIdTokenVerification: true,
						pkce: true
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
	return (auth ??= createAuth());
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
	return svelteKitHandler({
		auth,
		event,
		building,
		resolve: async (event) => {
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
		}
	});
};
