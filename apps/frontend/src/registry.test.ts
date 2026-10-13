import { describe, test, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import registry from '../registry.json';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const chatDir = 'src/lib/components/chat';

/** Every shippable file under `chat/`: tests and their `__tests__` helpers are excluded. */
function chatSourceFiles(): string[] {
	return readdirSync(`${frontendRoot}/${chatDir}`, { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.(svelte|ts|js)$/.test(file))
		.filter((file) => !file.includes('__tests__') && !/\.(test|spec)\./.test(file))
		.map((file) => `${chatDir}/${file}`)
		.sort();
}

describe('shadcn-svelte registry', () => {
	const chat = registry.items.find((item) => item.name === 'chat')!;
	const paths = chat.files.map((file) => file.path);

	test('ships every chat component and no tests', () => {
		const shipped = paths.filter((path) => path.startsWith(`${chatDir}/`)).sort();
		expect(shipped).toEqual(chatSourceFiles());
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
				target: `messages/chat/${locale}.json`
			});
		}
	});
});
