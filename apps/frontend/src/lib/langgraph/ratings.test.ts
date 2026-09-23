import { describe, test, expect } from 'vitest';
import { ratingKey, ratingsFromMetadata, setFlag } from './ratings';

describe('ratingKey', () => {
	test('namespaces the run id', () => {
		expect(ratingKey('run-abc')).toBe('rating:run-abc');
	});
});

describe('ratingsFromMetadata', () => {
	test('reads the ratings out, keyed by run', () => {
		expect(ratingsFromMetadata({ 'rating:run-1': 'up', 'rating:run-2': 'down' })).toEqual({
			'run-1': 'up',
			'run-2': 'down'
		});
	});

	test('ignores keys belonging to anything else on the thread', () => {
		// Metadata is a free dictionary — the title and whatever else lives there
		// must not turn into ratings.
		expect(ratingsFromMetadata({ title: 'A chat', user_id: 'up' })).toEqual({});
	});

	test('ignores values that are not a thumb', () => {
		// A stray or half-written value should drop out rather than render as a
		// highlight the user never chose.
		expect(
			ratingsFromMetadata({ 'rating:run-1': 'sideways', 'rating:run-2': null, 'rating:run-3': 1 })
		).toEqual({});
	});

	test.each([
		['no metadata', undefined],
		['null metadata', null],
		['empty metadata', {}]
	])('returns nothing for %s', (_label, metadata) => {
		expect(ratingsFromMetadata(metadata)).toEqual({});
	});

	test('keeps a run whose id contains the prefix', () => {
		// Only the first prefix is stripped; the rest is the id verbatim.
		expect(ratingsFromMetadata({ 'rating:rating:odd': 'up' })).toEqual({ 'rating:odd': 'up' });
	});
});

describe('setFlag', () => {
	test('adds a run', () => {
		expect(setFlag({}, 'run-1', true)).toEqual({ 'run-1': true });
	});

	test('removes a run', () => {
		expect(setFlag({ 'run-1': true, 'run-2': true }, 'run-1', false)).toEqual({ 'run-2': true });
	});

	test('leaves the original untouched', () => {
		// The caller assigns the result into `$state`; mutating in place would not
		// be seen, so a copy is the whole point.
		const before = { 'run-1': true } as Record<string, true>;
		setFlag(before, 'run-2', true);
		expect(before).toEqual({ 'run-1': true });
	});
});
