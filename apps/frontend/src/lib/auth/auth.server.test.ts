import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
	building: false,
	env: {} as Record<string, string>,
	getSession: vi.fn()
}));
vi.mock('$app/environment', () => ({
	get building() {
		return state.building;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('better-auth', () => ({
	betterAuth: (options: unknown) => ({ options, api: { getSession: state.getSession } })
}));

beforeEach(() => {
	vi.resetModules();
	for (const key of Object.keys(state.env)) delete state.env[key];
	state.building = false;
	state.getSession.mockReset().mockResolvedValue(null);
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
async function call(resolve = vi.fn().mockResolvedValue(new Response('page'))) {
	const { handle } = await import('./index');
	return handle({
		event: {
			request: new Request('https://frontend.test/chat'),
			url: new URL('https://frontend.test/chat'),
			locals: {}
		},
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
});

describe('auth configuration', () => {
	test('is stateless, ends only the local session on sign-out, and disables token refresh route', async () => {
		configured();
		const { getAuth } = await import('./index');
		const { options } = getAuth() as unknown as {
			options: {
				database?: unknown;
				disabledPaths: string[];
				account: { storeStateStrategy: string; storeAccountCookie: boolean };
				plugins: { id: string; options?: { config: Record<string, unknown>[] } }[];
			};
		};

		expect(options.database).toBeUndefined();
		expect(options.disabledPaths).toContain('/refresh-token');
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
