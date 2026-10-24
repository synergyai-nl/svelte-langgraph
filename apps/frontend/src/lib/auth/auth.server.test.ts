import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
	building: false,
	env: {} as Record<string, string>,
	getSession: vi.fn(),
	handler: vi.fn(),
	providers: [{ id: 'oidc' }],
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
						$context: Promise.resolve({ socialProviders: state.providers })
					}
	};
});

beforeEach(() => {
	vi.resetModules();
	for (const key of Object.keys(state.env)) delete state.env[key];
	state.building = false;
	state.getSession.mockReset().mockResolvedValue(null);
	state.handler.mockReset().mockResolvedValue(new Response('auth'));
	state.providers = [{ id: 'oidc' }];
	state.real = false;
	vi.unstubAllGlobals();
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
	test('is reused once the OIDC provider is discovered', async () => {
		configured();
		const { getAuth } = await import('./index');
		const first = getAuth();
		await first.$context;
		expect(getAuth()).toBe(first);
	});
	test('is recreated when discovery failed, so sign-in recovers without a restart', async () => {
		configured();
		state.providers = [];
		const { getAuth } = await import('./index');
		const first = getAuth();
		await first.$context;
		expect(getAuth()).not.toBe(first);
	});
});

describe('auth configuration', () => {
	test('is stateless, ends only the local session on sign-out, and keeps provider tokens server-side', async () => {
		configured();
		const { getAuth } = await import('./index');
		const { options } = getAuth() as unknown as {
			options: {
				database?: unknown;
				disabledPaths: string[];
				rateLimit: unknown;
				account: { storeStateStrategy: string; storeAccountCookie: boolean };
				plugins: { id: string; options?: { config: Record<string, unknown>[] } }[];
			};
		};

		expect(options.database).toBeUndefined();
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
