import { beforeEach, describe, expect, test, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn());
vi.mock('$lib/auth', () => ({ getAuth: async () => ({ api: { getAccessToken } }) }));

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

beforeEach(() => {
	getAccessToken.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('root layout load', () => {
	test('exposes the access token as session.accessToken, without leaking other fields', async () => {
		const expiry = new Date(Date.now() + 60_000);
		getAccessToken.mockResolvedValue({
			accessToken: 'access-token',
			accessTokenExpiresAt: expiry,
			idToken: 'id-token'
		});

		const { session } = await run({ session: { id: 's' }, user });

		expect(getAccessToken).toHaveBeenCalledWith(
			expect.objectContaining({ body: { useAccountCookie: true } })
		);
		expect(session).toEqual({
			user: { name: 'Ada', email: 'ada@example.com', image: null },
			accessToken: 'access-token',
			accessTokenExpiresAt: expiry.getTime()
		});
	});

	test('reports a missing expiry as null', async () => {
		getAccessToken.mockResolvedValue({ accessToken: 'access-token' });

		const { session } = (await run({ session: { id: 's' }, user })) as {
			session: { accessTokenExpiresAt: number | null };
		};

		expect(session.accessTokenExpiresAt).toBeNull();
	});

	test('reports a missing name as undefined so the UI falls back', async () => {
		getAccessToken.mockResolvedValue({ accessToken: 'access-token' });

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

	test('treats a missing access token as signed out', async () => {
		getAccessToken.mockResolvedValue({ idToken: 'id-token' });

		expect((await run({ session: { id: 's' }, user })).session).toBeNull();
	});
});
