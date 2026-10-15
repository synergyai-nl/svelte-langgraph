import { describe, test, expect } from 'vitest';
import { isCancellationError } from './errors';

describe('isCancellationError', () => {
	test.each([['CancelledError'], ['AbortError']])('recognises an %s', (name) => {
		const err = new Error('stopped');
		err.name = name;
		expect(isCancellationError(err)).toBe(true);
	});

	test.each([
		['a plain string from thread task history', 'CancelledError()'],
		['a string mentioning abort', 'asyncio.AbortError: run aborted'],
		['a non-Error object', { toString: (): string => 'CancelledError' }]
	])('recognises %s', (_label, value) => {
		// The Python server stores a cancellation as raw text, so by the time it
		// reaches the client it may not be an Error at all.
		expect(isCancellationError(value)).toBe(true);
	});

	test('does not treat a real failure as a cancellation', () => {
		// The distinction drives whether the UI shows an error, so a genuine
		// failure passing as a cancellation would silently swallow it.
		expect(isCancellationError(new Error('model exploded'))).toBe(false);
	});

	test.each([
		['undefined', undefined],
		['null', null]
	])('does not throw on %s', (_label, value) => {
		expect(isCancellationError(value)).toBe(false);
	});
});
