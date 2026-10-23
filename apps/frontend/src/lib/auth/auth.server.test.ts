import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
	building: false,
	env: {} as Record<string, string>,
	getSession: vi.fn(),
	handler: vi.fn(),
	providers: [{ id: 'oidc' }]
}));
vi.mock('$app/environment', () => ({
	get building() {
		return state.building;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('better-auth', () => ({
	betterAuth: (options: unknown) => ({
		options,
		api: { getSession: state.getSession },
		handler: state.handler,
		$context: Promise.resolve({ socialProviders: state.providers })
	})
}));

beforeEach(() => {
	vi.resetModules();
	for (const key of Object.keys(state.env)) delete state.env[key];
	state.building = false;
	state.getSession.mockReset().mockResolvedValue(null);
	state.handler.mockReset().mockResolvedValue(new Response('auth'));
	state.providers = [{ id: 'oidc' }];
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
	test('is stateless, ends only the local session on sign-out, and disables token refresh route', async () => {
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
		expect(options.disabledPaths).toContain('/refresh-token');
		// Only the credential-free sign-in redirect is exempt; the rest keeps the default limits.
		expect(options.rateLimit).toEqual({ customRules: { '/sign-in/social': false } });
		expect(options.account).toEqual({ storeStateStrategy: 'cookie', storeAccountCookie: true });
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
