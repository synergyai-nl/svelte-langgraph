import { describe, test, expect } from 'vitest';
import en from '../messages/en.json';
import nl from '../messages/nl.json';
import hi from '../messages/hi.json';

const locales = { nl, hi } as const;

/** `$schema` is metadata, not a translatable message. */
const keysOf = (messages: Record<string, unknown>) =>
	Object.keys(messages).filter((key) => key !== '$schema');

describe('message catalogue', () => {
	const englishKeys = keysOf(en);

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

	test('covers the whole landing page', () => {
		expect(englishKeys.filter((key) => key.startsWith('landing_')).length).toBeGreaterThan(0);
	});
});
