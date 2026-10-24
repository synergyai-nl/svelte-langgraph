import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { getAccountCookie } from 'better-auth/cookies';
import { genericOAuth } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { error, type Handle } from '@sveltejs/kit';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
// Every auth call waits for init, and init fetches OIDC discovery without a timeout.
const INIT_TIMEOUT_MS = 10_000;

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Required environment variable '${name}' not defined.`);
	return value;
}

// Without a database Better Auth does not check that the account cookie belongs to the session's
// user, so a stray account cookie would hand one user another user's provider tokens.
const bindAccountCookie = createAuthMiddleware(async (ctx) => {
	if (ctx.path !== '/get-access-token' && ctx.path !== '/refresh-token') return;
	const [account, session] = await Promise.all([getAccountCookie(ctx), getSessionFromCtx(ctx)]);
	if (account && account.userId !== session?.user.id) {
		throw APIError.from('BAD_REQUEST', { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
	}
});

function createAuth() {
	const issuer = required('AUTH_OIDC_ISSUER');
	return betterAuth({
		baseURL: required('BETTER_AUTH_URL'),
		secret: required('BETTER_AUTH_SECRET'),
		// The browser gets its access token from /get-access-token, which refreshes it when due.
		// The other token routes stay closed: nothing needs the refresh token over HTTP.
		disabledPaths: ['/refresh-token', '/account-info'],
		// Rate limiting belongs at the proxy, which knows the client IP.
		rateLimit: { enabled: false },
		session: {
			// Sessions end 30 days after sign-in, not 30 days after last use: a stateless session
			// cannot be extended, as refreshCache re-issues the cookies with the same expiry. Keep both
			// ages equal so the session and account cookies expire together.
			expiresIn: SESSION_MAX_AGE,
			cookieCache: { enabled: true, maxAge: SESSION_MAX_AGE, strategy: 'jwe', refreshCache: true }
		},
		account: { storeStateStrategy: 'cookie', storeAccountCookie: true },
		hooks: { before: bindAccountCookie },
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
						authentication: 'basic',
						// Auth0 only issues an API-audience access token when asked for one; other IdPs ignore it.
						...(env.AUTH_OIDC_AUDIENCE && {
							authorizationUrlParams: { audience: env.AUTH_OIDC_AUDIENCE }
						})
					}
				]
			}),
			sveltekitCookies(getRequestEvent)
		]
	});
}

async function initAuth() {
	const created = createAuth();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			created.$context,
			new Promise<never>((_, reject) => {
				timer = setTimeout(reject, INIT_TIMEOUT_MS, new Error('Auth init timed out'));
			})
		]);
	} finally {
		clearTimeout(timer);
	}
	return created;
}

// Configuration is process-wide; sessions and token lookups remain request-local. A failed or
// stalled init is dropped so the next request starts over, as is one whose OIDC discovery failed:
// Better Auth then starts without the provider, and token lookups would fail until a sign-in.
let auth: Promise<ReturnType<typeof createAuth>> | undefined;
export function getAuth() {
	if (!auth) {
		const pending = (auth = initAuth());
		const forget = () => {
			if (auth === pending) auth = undefined;
		};
		pending.then(async ({ $context }) => {
			if (!(await $context).socialProviders.some((provider) => provider.id === 'oidc')) forget();
		}, forget);
	}
	return auth;
}
export type Auth = Awaited<ReturnType<typeof getAuth>>;

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);
	let auth: Auth;
	try {
		auth = await getAuth();
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
