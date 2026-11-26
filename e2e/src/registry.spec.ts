import { test, expect } from './fixtures/test';

type RegistryItem = {
	name: string;
	registryDependencies?: string[];
	dependencies?: string[];
	files: { target: string; content: string }[];
};

test.describe('shadcn-svelte registry', () => {
	test('serves the chat item, which pulls in chat-core and ships no files', async ({ request }) => {
		const response = await request.get('/r/chat.json');
		expect(response.status()).toBe(200);

		const item = (await response.json()) as RegistryItem;
		expect(item.name).toBe('chat');
		expect(item.registryDependencies).toContain('./chat-core.json');
		expect(item.files).toEqual([]);
	});

	test('serves chat-core with the client library bundled', async ({ request }) => {
		// The CLI resolves chat's `./chat-core.json` against chat.json's URL, so both sit in /r/.
		const response = await request.get('/r/chat-core.json');
		expect(response.status()).toBe(200);

		const item = (await response.json()) as RegistryItem;
		expect(item.name).toBe('chat-core');
		expect(item.registryDependencies ?? []).toEqual([]);
		expect(item.dependencies?.filter((dep) => dep.startsWith('@svelte-langgraph/client'))).toEqual(
			[]
		);
		expect(
			item.files.some(
				(file) => file.target.startsWith('svelte-langgraph-client/') && file.content.length > 0
			)
		).toBe(true);
		// The build turns `#lib` into `$LIB$`, which the CLI replaces with the consumer's lib alias.
		const sources = item.files.map((file) => file.content).join('\n');
		expect(sources).toContain("'$LIB$/svelte-langgraph-client/index.ts'");
		expect(sources).not.toContain("'@svelte-langgraph/client'");
	});
});
