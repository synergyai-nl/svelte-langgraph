import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { OAuth2Server } from 'oauth2-mock-server';
import type { Auth } from './index';

const state = vi.hoisted(() => ({ building: false }));
vi.mock('$app/environment', () => ({
	get building() {
		return state.building;
	}
}));
vi.mock('$app/server', () => ({ getRequestEvent: () => undefined }));
// Better Auth reads process.env itself; let the OIDC settings come from there too.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

// A real OIDC provider in-process; the subject of the tokens it issues is chosen per sign-in.
const idp = new OAuth2Server();
let subject = '';

beforeAll(async () => {
	await idp.issuer.keys.generate('RS256');
	await idp.start(0, '127.0.0.1');
	idp.service.on('beforeTokenSigning', (token) => {
		token.payload.sub = subject;
		token.payload.jti = crypto.randomUUID();
	});
	idp.service.on('beforeUserinfo', (response) => {
		response.body = { sub: subject, email: `${subject}@example.test`, name: subject };
	});
});
afterAll(() => idp.stop());

// Warm the better-auth module graph once, so no single test pays the cold load (CI timed out at 5 s).
beforeAll(async () => {
	state.building = true;
	await import('./index');
}, 60_000);

beforeEach(() => {
	vi.resetModules();
	state.building = false;
	vi.stubEnv('BETTER_AUTH_URL', 'https://frontend.test');
	vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-with-at-least-thirty-two-characters');
	vi.stubEnv('AUTH_OIDC_ISSUER', idp.issuer.url!);
	vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'client');
	vi.stubEnv('AUTH_OIDC_CLIENT_SECRET', 'secret');
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

const loadAuth = async () => (await import('./index')).auth;

type Jar = Map<string, string>;

const cookieHeaders = (jar: Jar) =>
	new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') });

function applySetCookies(jar: Jar, headers: Headers) {
	for (const line of headers.getSetCookie()) {
		const [pair, ...attributes] = line.split(';');
		const name = pair.slice(0, pair.indexOf('=')).trim();
		const value = pair.slice(pair.indexOf('=') + 1).trim();
		if (!value || attributes.some((attribute) => /max-age=0\b/i.test(attribute))) jar.delete(name);
		else jar.set(name, value);
	}
}

/** Runs the full OIDC sign-in for `sub` against the provider and returns the auth cookies. */
async function signIn(auth: Auth, sub: string): Promise<Jar> {
	subject = sub;
	const jar: Jar = new Map();
	const start = await auth.api.signInSocial({
		body: { provider: 'oidc', callbackURL: '/' },
		headers: new Headers(),
		returnHeaders: true
	});
	applySetCookies(jar, start.headers);
	const authorize = await fetch(start.response.url!, { redirect: 'manual' });
	const callbackUrl = authorize.headers.get('location')!;
	const callback = await auth.handler(new Request(callbackUrl, { headers: cookieHeaders(jar) }));
	applySetCookies(jar, callback.headers);
	return jar;
}

const subjectOf = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub as string;

describe('while building', () => {
	test('there is no auth instance, so the build needs no settings and fetches nothing', async () => {
		state.building = true;
		for (const name of ['AUTH_OIDC_ISSUER', 'AUTH_OIDC_CLIENT_ID', 'AUTH_OIDC_CLIENT_SECRET']) {
			vi.stubEnv(name, undefined);
		}
		const fetch = vi.spyOn(globalThis, 'fetch');
		expect(await loadAuth()).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('auth configuration', () => {
	test('is stateless, ends only the local session on sign-out, and keeps provider tokens server-side', async () => {
		const { options } = (await loadAuth()) as unknown as {
			options: {
				database?: unknown;
				session: { expiresIn: number };
				disabledPaths: string[];
				rateLimit: { enabled?: boolean };
				plugins: { id: string; options?: { config: Record<string, unknown>[] } }[];
			};
		};

		expect(options.database).toBeUndefined();
		expect(options.session.expiresIn).toBe(30 * 24 * 60 * 60);
		expect(options.disabledPaths).toEqual(['/get-access-token', '/refresh-token', '/account-info']);
		// Better Auth's default: on in production.
		expect(options.rateLimit.enabled).toBeUndefined();
		const oauth = options.plugins.find((plugin) => plugin.id === 'generic-oauth');
		expect(oauth?.options?.config[0]).toMatchObject({
			providerId: 'oidc',
			pkce: true,
			requireIdTokenVerification: true,
			disableProviderLogout: true
		});
		// sveltekitCookies must come last so it sees every Set-Cookie.
		expect(options.plugins.at(-1)?.id).toBe('sveltekit-cookies');
	});
});

describe('auth HTTP routes', () => {
	test('are routed by path, even when the request origin differs from BETTER_AUTH_URL', async () => {
		const auth = await loadAuth();
		const url = 'http://frontend.internal:3000/api/auth/ok';
		const resolve = vi.fn();
		const response = await svelteKitHandler({
			event: { request: new Request(url), url: new URL(url) } as RequestEvent,
			resolve,
			auth,
			building: false
		});
		expect(await response.json()).toEqual({ ok: true });
		expect(resolve).not.toHaveBeenCalled();
	});

	test.each(['get-access-token', 'refresh-token', 'account-info?useAccountCookie=true'])(
		'%s is not served over HTTP',
		async (path) => {
			const auth = await loadAuth();
			const post = !path.startsWith('account-info');
			const response = await auth.handler(
				new Request(`https://frontend.test/api/auth/${path}`, {
					method: post ? 'POST' : 'GET',
					headers: { 'content-type': 'application/json', origin: 'https://frontend.test' },
					body: post ? JSON.stringify({ providerId: 'oidc' }) : undefined
				})
			);
			expect(response.status).toBe(404);
		}
	);
});

describe('account cookie', () => {
	test('yields and refreshes the provider tokens of the signed-in user', async () => {
		const auth = await loadAuth();
		const alice = await signIn(auth, 'alice');
		const body = { useAccountCookie: true as const };

		const tokens = await auth.api.getAccessToken({ headers: cookieHeaders(alice), body });
		expect(subjectOf(tokens.accessToken)).toBe('alice');
		expect(subjectOf(tokens.idToken!)).toBe('alice');
		const refreshed = await auth.api.refreshToken({ headers: cookieHeaders(alice), body });
		expect(subjectOf(refreshed.accessToken!)).toBe('alice');
		expect(refreshed.accessToken).not.toBe(tokens.accessToken);
	});

	test('is refused when it belongs to another user than the session', async () => {
		const auth = await loadAuth();
		const alice = await signIn(auth, 'alice');
		const bob = await signIn(auth, 'bob');
		const mixed = new Map(bob);
		for (const [name, value] of alice) if (name.includes('account_data')) mixed.set(name, value);
		expect([...mixed.keys()].some((name) => name.includes('account_data'))).toBe(true);
		const body = { useAccountCookie: true as const };

		const own = await auth.api.getAccessToken({ headers: cookieHeaders(bob), body });
		expect(subjectOf(own.accessToken)).toBe('bob');
		const headers = cookieHeaders(mixed);
		for (const call of [
			() => auth.api.getAccessToken({ headers, body }),
			() => auth.api.refreshToken({ headers, body }),
			() => auth.api.accountInfo({ headers, query: body })
		]) {
			await expect(call()).rejects.toMatchObject({ body: { code: 'ACCOUNT_NOT_FOUND' } });
		}
	});
});
