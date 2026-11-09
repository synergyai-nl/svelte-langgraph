import { beforeEach, describe, expect, test, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn());
vi.mock('$lib/auth', () => ({ auth: { api: { getAccessToken } } }));

import { load } from './+layout.server';

const user = { name: 'Ada', email: 'ada@example.com', image: null, id: 'u1' };

function run(locals: Record<string, unknown>) {
	return load({
		locals,
		request: new Request('https://frontend.test/'),
		cookies: { get: () => undefined }
	} as unknown as Parameters<typeof load>[0]) as Promise<{
		session: unknown;
		sidebarOpen: boolean;
	}>;
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** An unsigned JWT; the layout only reads `exp`. */
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

beforeEach(() => {
	getAccessToken.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('root layout load', () => {
	test('exposes the ID token as session.accessToken, without leaking other fields', async () => {
		const idToken = jwt({ exp: inSeconds(3600) });
		getAccessToken.mockResolvedValue({ accessToken: 'opaque', idToken });

		const { session } = await run({ session: { id: 's' }, user });

		expect(getAccessToken).toHaveBeenCalledWith(
			expect.objectContaining({ body: { useAccountCookie: true } })
		);
		expect(session).toEqual({
			user: { name: 'Ada', email: 'ada@example.com', image: null },
			accessToken: idToken
		});
	});

	test('reports a missing name as undefined so the UI falls back', async () => {
		getAccessToken.mockResolvedValue({ idToken: jwt({ exp: inSeconds(3600) }) });

		const { session } = (await run({ session: { id: 's' }, user: { ...user, name: '' } })) as {
			session: { user: { name?: string } };
		};

		expect(session.user.name).toBeUndefined();
	});

	test('has no session when signed out, without looking up tokens', async () => {
		const { session } = await run({ session: null, user: null });

		expect(session).toBeNull();
		expect(getAccessToken).not.toHaveBeenCalled();
	});

	test('treats a failed token lookup as signed out', async () => {
		getAccessToken.mockRejectedValue(new Error('secret-token-material'));

		const { session } = await run({ session: { id: 's' }, user });

		expect(session).toBeNull();
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-token');
	});

	test('treats a missing ID token as signed out', async () => {
		getAccessToken.mockResolvedValue({ accessToken: 'opaque' });

		expect((await run({ session: { id: 's' }, user })).session).toBeNull();
	});

	test.each([
		['an expired', jwt({ exp: inSeconds(-60) })],
		['an exp-less', jwt({ sub: 'u1' })],
		['a non-JWT', 'not-a-jwt']
	])('treats %s ID token as signed out', async (_label, idToken) => {
		getAccessToken.mockResolvedValue({ accessToken: 'opaque', idToken });

		expect((await run({ session: { id: 's' }, user })).session).toBeNull();
	});
});
