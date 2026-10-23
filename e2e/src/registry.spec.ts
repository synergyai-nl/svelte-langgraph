import { test, expect } from './fixtures/test';

type RegistryItem = {
	name: string;
	dependencies: string[];
	files: { target: string; content: string }[];
};

test.describe('shadcn-svelte registry', () => {
	test('serves the chat item with the client library bundled', async ({ request }) => {
		const response = await request.get('/r/chat.json');
		expect(response.status()).toBe(200);

		const item = (await response.json()) as RegistryItem;
		expect(item.name).toBe('chat');
		expect(item.dependencies.filter((dep) => dep.startsWith('@svelte-langgraph/client'))).toEqual(
			[]
		);
		expect(
			item.files.some(
				(file) => file.target.startsWith('svelte-langgraph-client/') && file.content.length > 0
			)
		).toBe(true);
	});
});
