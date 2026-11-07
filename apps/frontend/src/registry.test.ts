import { describe, test, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import registry from '../registry.json';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const chatDir = 'src/lib/components/chat';

/** Every shippable file under `root/dir`, as `dir/file`: tests and `__tests__` helpers excluded. */
function sourceFiles(root: string, dir: string): string[] {
	return readdirSync(`${root}/${dir}`, { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.(svelte|ts|js)$/.test(file))
		.filter((file) => !file.includes('__tests__') && !/\.(test|spec)\./.test(file))
		.map((file) => `${dir}/${file}`)
		.sort();
}

/** `@svelte-langgraph/client` is unpublished, so its source ships in the item, under `$lib`. */
const clientDir = '../../packages/client/src';
const clientTarget = 'svelte-langgraph-client';

describe('shadcn-svelte registry', () => {
	const chat = registry.items.find((item) => item.name === 'chat')!;
	const paths = chat.files.map((file) => file.path);

	test('ships every chat component and no tests', () => {
		const shipped = paths.filter((path) => path.startsWith(`${chatDir}/`)).sort();
		expect(shipped).toEqual(sourceFiles(frontendRoot, chatDir));
	});

	test('installs chat components under chat/, preserving their layout', () => {
		for (const file of chat.files.filter((file) => file.path.startsWith(`${chatDir}/`))) {
			expect(file.type).toBe('registry:component');
			expect(file.target).toBe(file.path.replace('src/lib/components/', ''));
		}
	});

	test('ships the chat message catalogue for every locale', () => {
		for (const locale of ['en', 'nl', 'hi']) {
			expect(chat.files).toContainEqual({
				path: `messages/chat/${locale}.json`,
				type: 'registry:file',
				target: `~/messages/chat/${locale}.json`
			});
		}
	});

	test('ships no ui/ files and depends on the stock sidebar instead', () => {
		expect(paths.filter((path) => path.startsWith('src/lib/components/ui/'))).toEqual([]);
		expect(chat.registryDependencies).toContain('sidebar');
	});

	test('ships every client library file as registry:lib under svelte-langgraph-client/', () => {
		const expected = sourceFiles(frontendRoot, clientDir).map((path) => ({
			path,
			type: 'registry:lib',
			target: path.replace(`${clientDir}/`, `${clientTarget}/`)
		}));
		const shipped = chat.files
			.filter((file) => file.target.startsWith(`${clientTarget}/`))
			.sort((a, b) => (a.path < b.path ? -1 : 1));
		expect(shipped).toEqual(expected);
	});

	test('does not depend on the unpublished client package', () => {
		// Keep the explicit `dependencies` key: without it the CLI re-infers it from imports.
		expect(chat.dependencies.filter((dep) => dep.startsWith('@svelte-langgraph/client'))).toEqual(
			[]
		);
	});
});
