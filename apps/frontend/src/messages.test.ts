import { describe, test, expect } from 'vitest';
import en from '../messages/en.json';
import nl from '../messages/nl.json';
import hi from '../messages/hi.json';
import chatEn from '../messages/chat/en.json';
import chatNl from '../messages/chat/nl.json';
import chatHi from '../messages/chat/hi.json';

/**
 * Both catalogues `project.inlang/settings.json` loads via its `pathPattern` array: the app's own
 * messages, and the chat components' (shipped to consumers through the shadcn-svelte registry).
 */
const catalogues = {
	app: { en, locales: { nl, hi } },
	chat: { en: chatEn, locales: { nl: chatNl, hi: chatHi } }
} as const;

/** `$schema` is metadata, not a translatable message. */
const keysOf = (messages: Record<string, unknown>) =>
	Object.keys(messages).filter((key) => key !== '$schema');

describe.each(Object.entries(catalogues))(
	'%s message catalogue',
	(_catalogue, { en: english, locales }) => {
		const englishKeys = keysOf(english);

		describe.each(Object.entries(locales))('%s', (_name, messages) => {
			const localeKeys = keysOf(messages as Record<string, unknown>);

			test('translates every English key', () => {
				// Paraglide falls back to English for a missing key, so an untranslated
				// string shows up as mixed-language UI rather than a build failure.
				expect(englishKeys.filter((key) => !localeKeys.includes(key))).toEqual([]);
			});

			test('defines no keys missing from English', () => {
				expect(localeKeys.filter((key) => !englishKeys.includes(key))).toEqual([]);
			});

			test('leaves no message empty', () => {
				const empty = localeKeys.filter(
					(key) => (messages as Record<string, string>)[key].trim() === ''
				);
				expect(empty).toEqual([]);
			});
		});
	}
);

describe('message catalogues', () => {
	test('covers the whole landing page', () => {
		expect(keysOf(en).filter((key) => key.startsWith('landing_')).length).toBeGreaterThan(0);
	});

	test('share no keys between the app and chat catalogues', () => {
		// Both files compile into one flat `m.*` namespace, so a key defined in both is ambiguous.
		const chatKeys = keysOf(chatEn);
		expect(keysOf(en).filter((key) => chatKeys.includes(key))).toEqual([]);
	});
});
