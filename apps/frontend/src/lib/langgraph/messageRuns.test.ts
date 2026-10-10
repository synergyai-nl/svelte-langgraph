import { describe, test, expect } from 'vitest';
import { messageRunKey, messageRunsFromMetadata } from './messageRuns';

describe('messageRunKey', () => {
	test('namespaces the message id', () => {
		expect(messageRunKey('msg-abc')).toBe('run:msg-abc');
	});
});

describe('messageRunsFromMetadata', () => {
	test('reads the producing run ids out, keyed by message', () => {
		expect(messageRunsFromMetadata({ 'run:msg-1': 'run-a', 'run:msg-2': 'run-b' })).toEqual({
			'msg-1': 'run-a',
			'msg-2': 'run-b'
		});
	});

	test('ignores keys belonging to anything else on the thread', () => {
		// Metadata is a free dictionary — the title, ratings, and whatever else
		// lives there must not turn into message-run entries.
		expect(messageRunsFromMetadata({ title: 'A chat', 'rating:run-1': 'up' })).toEqual({});
	});

	test('ignores values that are not a non-empty string', () => {
		expect(messageRunsFromMetadata({ 'run:msg-1': '', 'run:msg-2': null, 'run:msg-3': 1 })).toEqual(
			{}
		);
	});

	test.each([
		['no metadata', undefined],
		['null metadata', null],
		['empty metadata', {}]
	])('returns nothing for %s', (_label, metadata) => {
		expect(messageRunsFromMetadata(metadata)).toEqual({});
	});

	test('keeps a message id whose id contains the prefix', () => {
		// Only the first prefix is stripped; the rest is the id verbatim.
		expect(messageRunsFromMetadata({ 'run:run:odd': 'run-a' })).toEqual({ 'run:odd': 'run-a' });
	});

	test('two messages can share the same producing run', () => {
		// Keyed by message, not by run, so parallel tool calls or multiple AI
		// messages from one run don't collide.
		expect(messageRunsFromMetadata({ 'run:msg-1': 'run-a', 'run:msg-2': 'run-a' })).toEqual({
			'msg-1': 'run-a',
			'msg-2': 'run-a'
		});
	});
});
