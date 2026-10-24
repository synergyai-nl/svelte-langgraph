import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import { cookieHeaders, mockIdp, signIn } from './__tests__/mock-idp';

const state = vi.hoisted(() => ({
	building: false,
	env: {} as Record<string, string>,
	getSession: vi.fn(),
	handler: vi.fn(),
	context: Promise.resolve({}) as Promise<unknown>,
	real: false
}));
vi.mock('$app/environment', () => ({
	get building() {
		return state.building;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('better-auth', async (importActual) => {
	const actual = await importActual<typeof import('better-auth')>();
	return {
		betterAuth: (options: Parameters<typeof actual.betterAuth>[0]) =>
			state.real
				? actual.betterAuth(options)
				: {
						options,
						api: { getSession: state.getSession },
						handler: state.handler,
						$context: state.context
					}
	};
});

beforeEach(() => {
	vi.resetModules();
	for (const key of Object.keys(state.env)) delete state.env[key];
	state.building = false;
	state.getSession.mockReset().mockResolvedValue(null);
	state.handler.mockReset().mockResolvedValue(new Response('auth'));
	state.context = Promise.resolve({});
	state.real = false;
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
function configured() {
	Object.assign(state.env, {
		BETTER_AUTH_URL: 'https://frontend.test',
		BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
		AUTH_OIDC_ISSUER: 'https://provider.test',
		AUTH_OIDC_CLIENT_ID: 'client',
		AUTH_OIDC_CLIENT_SECRET: 'secret'
	});
}
async function call(
	resolve = vi.fn().mockResolvedValue(new Response('page')),
	url = 'https://frontend.test/chat'
) {
	const { handle } = await import('./index');
	return handle({
		event: { request: new Request(url), url: new URL(url), locals: {} },
		resolve
	} as unknown as Parameters<Handle>[0]);
}
describe('runtime auth hook', () => {
	test('skips auth during a build without secrets', async () => {
		state.building = true;
		expect((await call()).status).toBe(200);
		expect(state.getSession).not.toHaveBeenCalled();
	});
	test('missing runtime configuration fails with sanitized 503', async () => {
		await expect(call()).rejects.toMatchObject({
			status: 503,
			body: { message: 'Authentication is temporarily unavailable' }
		});
	});
	test('session lookup failures are operational 503s', async () => {
		configured();
		state.getSession.mockRejectedValue(new Error('private diagnostic'));
		await expect(call()).rejects.toMatchObject({
			status: 503,
			body: { message: 'Authentication is temporarily unavailable' }
		});
	});
	test('renders pages while the OIDC provider is unreachable', async () => {
		configured();
		state.real = true;
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		expect(await (await call()).text()).toBe('page');
	});
	test('does not reclassify failures in application routes', async () => {
		configured();
		const failure = new Error('application failure');
		await expect(call(vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
	});
	test('serves auth paths by path, even when the request origin differs from the base URL', async () => {
		configured();
		const resolve = vi.fn();
		const response = await call(resolve, 'http://frontend.internal:3000/api/auth/sign-in/social');
		expect(await response.text()).toBe('auth');
		expect(resolve).not.toHaveBeenCalled();
		expect(state.getSession).not.toHaveBeenCalled();
	});
});

describe('auth instance', () => {
	test('is reused once initialised', async () => {
		configured();
		const { getAuth } = await import('./index');
		const first = await getAuth();
		expect(await getAuth()).toBe(first);
	});
	test('is recreated when init stalls, so a slow provider cannot block requests for good', async () => {
		configured();
		state.context = new Promise(() => {});
		vi.useFakeTimers();
		const { getAuth } = await import('./index');
		const first = getAuth();
		const failed = expect(first).rejects.toThrow('Auth init timed out');
		await vi.advanceTimersByTimeAsync(10_000);
		await failed;
		expect(getAuth()).not.toBe(first);
	});
});

describe('auth configuration', () => {
	test('is stateless, ends only the local session on sign-out, and keeps provider tokens server-side', async () => {
		configured();
		const { getAuth } = await import('./index');
		const { options } = (await getAuth()) as unknown as {
			options: {
				database?: unknown;
				session: { expiresIn: number; cookieCache: { maxAge: number } };
				disabledPaths: string[];
				rateLimit: unknown;
				account: { storeStateStrategy: string; storeAccountCookie: boolean };
				plugins: { id: string; options?: { config: Record<string, unknown>[] } }[];
			};
		};

		expect(options.database).toBeUndefined();
		// Not rolling: a stateless session ends 30 days after sign-in, with all its cookies.
		expect(options.session.expiresIn).toBe(30 * 24 * 60 * 60);
		expect(options.session.cookieCache.maxAge).toBe(options.session.expiresIn);
		expect(options.disabledPaths).toEqual(['/get-access-token', '/refresh-token']);
		// Left to the proxy: without a trusted client IP, Better Auth shares one bucket for all.
		expect(options.rateLimit).toEqual({ enabled: false });
		expect(options.account).toEqual({ storeStateStrategy: 'cookie', storeAccountCookie: true });
		const oauth = options.plugins.find((plugin) => plugin.id === 'generic-oauth');
		expect(oauth?.options?.config[0]).toMatchObject({
			providerId: 'oidc',
			pkce: true,
			requireIdTokenVerification: true,
			disableProviderLogout: true,
			authentication: 'basic'
		});
		// sveltekitCookies must come last so it sees every Set-Cookie.
		expect(options.plugins.at(-1)?.id).toBe('sveltekit-cookies');
	});
});

describe('auth HTTP routes', () => {
	test.each(['/api/auth/get-access-token', '/api/auth/refresh-token'])(
		'%s is not served over HTTP',
		async (path) => {
			configured();
			state.real = true;
			// OIDC discovery fails fast; the disabled-path check does not depend on it.
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
			const { handle } = await import('./index');
			const url = `https://frontend.test${path}`;
			const request = new Request(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'https://frontend.test' },
				body: JSON.stringify({ providerId: 'oidc' })
			});
			const response = await handle({
				event: { request, url: new URL(url), locals: {} },
				resolve: vi.fn()
			} as unknown as Parameters<Handle>[0]);
			expect(response.status).toBe(404);
		}
	);
});

describe('account cookie', () => {
	test('is refused when it belongs to another user than the session', async () => {
		configured();
		state.real = true;
		const idp = await mockIdp();
		const { getAuth } = await import('./index');
		const auth = await getAuth();
		const alice = await signIn(auth, idp, 'alice');
		const bob = await signIn(auth, idp, 'bob');
		const mixed = new Map(bob);
		for (const [name, value] of alice) if (name.includes('account_data')) mixed.set(name, value);
		expect([...mixed.keys()].some((name) => name.includes('account_data'))).toBe(true);
		const body = { useAccountCookie: true as const };

		const own = await auth.api.getAccessToken({ headers: cookieHeaders(bob), body });
		expect(own.accessToken).toBe('access-bob');
		await expect(
			auth.api.getAccessToken({ headers: cookieHeaders(mixed), body })
		).rejects.toMatchObject({ body: { code: 'ACCOUNT_NOT_FOUND' } });
		await expect(
			auth.api.refreshToken({ headers: cookieHeaders(mixed), body })
		).rejects.toMatchObject({ body: { code: 'ACCOUNT_NOT_FOUND' } });
	});
});
