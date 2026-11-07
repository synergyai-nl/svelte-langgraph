import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import registry from '../registry.json';
import pkg from '../package.json';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const chatDir = 'src/lib/components/chat';

/** The consumer components folder the item owns, so a re-run never touches the app's own files. */
const itemTarget = 'svelte-langgraph';

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

	test('installs chat components flat under svelte-langgraph/, keeping their subfolders', () => {
		for (const file of chat.files.filter((file) => file.path.startsWith(`${chatDir}/`))) {
			expect(file.type).toBe('registry:component');
			expect(file.target).toBe(file.path.replace(`${chatDir}/`, `${itemTarget}/`));
		}
	});

	test('installs nothing outside its own folders', () => {
		const folders: Record<string, string> = {
			'registry:component': `${itemTarget}/`,
			'registry:file': `~/messages/${itemTarget}/`,
			'registry:lib': `${clientTarget}/`
		};
		for (const file of chat.files) {
			expect(file.target.startsWith(folders[file.type]), file.target).toBe(true);
		}
	});

	test('never imports its own files through $lib/components/chat/, which only exists here', () => {
		// Relative imports survive the move to svelte-langgraph/; a `$lib/components/chat/` one would not.
		for (const { path } of chat.files.filter((file) => file.path.startsWith(`${chatDir}/`))) {
			expect(readFileSync(`${frontendRoot}/${path}`, 'utf8'), path).not.toMatch(
				/\$lib\/components\/chat\//
			);
		}
	});

	test('ships the chat message catalogue for every locale', () => {
		for (const locale of ['en', 'nl', 'hi']) {
			expect(chat.files).toContainEqual({
				path: `messages/svelte-langgraph/${locale}.json`,
				type: 'registry:file',
				target: `~/messages/svelte-langgraph/${locale}.json`
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

	test('lists only the packages the chat adds, at the demo app ranges', () => {
		// Packages a shadcn-svelte + Paraglide app already has (`@lucide/svelte`, `bits-ui`,
		// `tailwind-variants`, `@inlang/paraglide-js`) stay out: the CLI would rewrite their ranges.
		const ranges: Record<string, string> = { ...pkg.devDependencies, ...pkg.dependencies };
		const expected = [
			'@langchain/langgraph-sdk',
			'@langchain/svelte',
			'@tailwindcss/typography',
			'svelte-exmarkdown'
		].map((name) => `${name}@${ranges[name]}`);
		expect(chat.dependencies).toEqual(expected);
	});

	test('does not depend on the unpublished client package', () => {
		// Keep the explicit `dependencies` key: without it the CLI re-infers it from imports.
		expect(chat.dependencies.filter((dep) => dep.startsWith('@svelte-langgraph/client'))).toEqual(
			[]
		);
	});
});
