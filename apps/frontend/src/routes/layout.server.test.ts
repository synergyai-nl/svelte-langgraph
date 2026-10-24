import { describe, expect, test } from 'vitest';
import { load } from './+layout.server';

const user = { name: 'Ada', email: 'ada@example.com', image: null, id: 'u1' };

function run(locals: Record<string, unknown>) {
	return load({
		locals,
		cookies: { get: () => undefined }
	} as unknown as Parameters<typeof load>[0]) as Promise<{
		session: unknown;
		sidebarOpen: boolean;
	}>;
}

describe('root layout load', () => {
	test('exposes only the user, never provider tokens', async () => {
		const { session } = await run({ session: { id: 's' }, user });

		expect(session).toEqual({
			user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null }
		});
	});

	test('reports a missing name as undefined so the UI falls back', async () => {
		const { session } = (await run({ session: { id: 's' }, user: { ...user, name: '' } })) as {
			session: { user: { name?: string } };
		};

		expect(session.user.name).toBeUndefined();
	});

	test('has no session when signed out', async () => {
		expect((await run({ session: null, user: null })).session).toBeNull();
	});
});
