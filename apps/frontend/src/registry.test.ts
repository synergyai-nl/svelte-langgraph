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

/** Patched copies of upstream shadcn-svelte ui items that the chat components depend on. */
const patchedUiDirs = ['sidebar', 'spinner', 'copy-button'];
const uiDir = 'src/lib/components/ui';

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

	test.each(patchedUiDirs)('ships every file of the patched ui/%s and no tests', (dir) => {
		const shipped = paths.filter((path) => path.startsWith(`${uiDir}/${dir}/`)).sort();
		expect(shipped).toEqual(sourceFiles(frontendRoot, `${uiDir}/${dir}`));
	});

	test('installs patched ui files into the consumer ui directory', () => {
		for (const dir of patchedUiDirs) {
			for (const file of chat.files.filter((file) => file.path.startsWith(`${uiDir}/${dir}/`))) {
				expect(file.type).toBe('registry:ui');
				expect(file.target).toBe(file.path.replace(`${uiDir}/`, ''));
			}
		}
	});

	test('does not also depend on the upstream versions of the patched ui items', () => {
		for (const dir of patchedUiDirs) {
			expect(chat.registryDependencies).not.toContain(dir);
		}
		expect(chat.registryDependencies.join()).not.toContain('copy-button');
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
