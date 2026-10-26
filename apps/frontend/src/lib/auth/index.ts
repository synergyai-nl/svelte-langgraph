import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { getAccountCookie } from 'better-auth/cookies';
import { genericOAuth } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Required environment variable '${name}' not defined.`);
	return value;
}

// Without a database Better Auth skips the check that the account cookie belongs to the session's
// user, on purpose since https://github.com/better-auth/better-auth/pull/9979 (fixing #9978), so a
// stray account cookie would hand one user another user's provider tokens. Re-add it here.
const bindAccountCookie = createAuthMiddleware(async (ctx) => {
	if (!['/get-access-token', '/refresh-token', '/account-info'].includes(ctx.path)) return;
	const [account, session] = await Promise.all([getAccountCookie(ctx), getSessionFromCtx(ctx)]);
	if (account && account.userId !== session?.user.id) {
		throw APIError.from('BAD_REQUEST', { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
	}
});

// BETTER_AUTH_URL and BETTER_AUTH_SECRET are read from the environment by Better Auth itself.
const createAuth = () =>
	betterAuth({
		// Provider tokens stay server-side: the root layout reads them via auth.api, not HTTP.
		disabledPaths: ['/get-access-token', '/refresh-token', '/account-info'],
		// Stateless sessions cannot slide, by design since https://github.com/better-auth/better-auth/pull/8817.
		session: { expiresIn: SESSION_MAX_AGE },
		// Unset keeps Better Auth's default (on in production). E2E signs in more often than the
		// 3-per-10-seconds sign-in limit allows, so .env.e2e sets AUTH_RATE_LIMIT=false.
		rateLimit: { enabled: env.AUTH_RATE_LIMIT === 'false' ? false : undefined },
		hooks: { before: bindAccountCookie },
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: 'oidc',
						discoveryUrl: `${required('AUTH_OIDC_ISSUER').replace(/\/$/, '')}/.well-known/openid-configuration`,
						clientId: required('AUTH_OIDC_CLIENT_ID'),
						clientSecret: required('AUTH_OIDC_CLIENT_SECRET'),
						scopes: (env.AUTH_OIDC_SCOPES ?? 'openid profile email offline_access')
							.split(/\s+/)
							.filter(Boolean),
						// Sign-out ends the local session only; no redirect to the provider.
						disableProviderLogout: true,
						requireIdTokenVerification: true,
						pkce: true
					}
				]
			}),
			sveltekitCookies(getRequestEvent)
		]
	});

// betterAuth() starts initialising at once: it requires BETTER_AUTH_SECRET in production and
// fetches OIDC discovery. The build imports this module without runtime settings and never uses
// auth (the auth handle skips it while building), so it gets no instance.
export const auth = building ? (null as unknown as ReturnType<typeof createAuth>) : createAuth();
export type Auth = typeof auth;
