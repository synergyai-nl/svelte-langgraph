import { describe, it, expect } from 'vitest';
import { shortenThreadId, threadLabel, toThreadSummary, type SearchedThread } from './threads.js';

function makeSearchedThread(overrides: Partial<SearchedThread> = {}): SearchedThread {
	return {
		thread_id: 'thread-abcdefgh-1234',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-02T00:00:00.000Z',
		status: 'idle',
		metadata: {},
		...overrides
	};
}

describe('toThreadSummary', () => {
	it('maps SDK field names to the summary shape', () => {
		const t = makeSearchedThread();
		const summary = toThreadSummary(t);

		expect(summary).toEqual({
			id: t.thread_id,
			createdAt: t.created_at,
			updatedAt: t.updated_at,
			status: t.status,
			metadata: t.metadata,
			title: null
		});
	});

	it('uses metadata.title as title when it is a string', () => {
		const t = makeSearchedThread({ metadata: { title: 'My chat' } });
		expect(toThreadSummary(t).title).toBe('My chat');
	});

	it('falls back to null title when metadata.title is not a string', () => {
		const t = makeSearchedThread({ metadata: { title: 42 } });
		expect(toThreadSummary(t).title).toBeNull();
	});

	it('falls back to null title when metadata.title is missing', () => {
		const t = makeSearchedThread({ metadata: { other: 'value' } });
		expect(toThreadSummary(t).title).toBeNull();
	});

	it('defaults metadata to an empty object when absent', () => {
		const { thread_id, created_at, updated_at, status } = makeSearchedThread();
		const t = { thread_id, created_at, updated_at, status } as SearchedThread;
		expect(toThreadSummary(t).metadata).toEqual({});
	});
});

describe('shortenThreadId', () => {
	it('returns the last 8 characters of the id', () => {
		expect(shortenThreadId('0198c000-aaaa-7000-8000-0123456789ab')).toBe('456789ab');
	});

	it('returns the whole id when shorter than 8 characters', () => {
		expect(shortenThreadId('abc')).toBe('abc');
	});

	it('produces different labels for two UUIDv7 ids sharing the same timestamp prefix', () => {
		// UUIDv7's leading hex digits are the high-order timestamp bits, so threads created on
		// the same day (as every thread in a single test run typically is) share them. The
		// low-order bits — the tail — are random, which is why slicing from the end (not the
		// start, the pre-SLG-104-fix behaviour) is what actually distinguishes rows in the
		// sidebar. This is the case the first-8 bug missed entirely.
		const sameDayPrefix = '0198c000-1a2b';
		const a = `${sameDayPrefix}-7000-8000-aaaaaaaaaaaa`;
		const b = `${sameDayPrefix}-7000-8000-bbbbbbbbbbbb`;

		expect(shortenThreadId(a)).not.toBe(shortenThreadId(b));
	});
});

describe('threadLabel', () => {
	it('returns the title when present', () => {
		const summary = toThreadSummary(makeSearchedThread({ metadata: { title: 'Planning trip' } }));
		expect(threadLabel(summary)).toBe('Planning trip');
	});

	it('falls back to the shortened id when there is no title', () => {
		const summary = toThreadSummary(makeSearchedThread({ thread_id: 'abcdefghijkl' }));
		expect(threadLabel(summary)).toBe('efghijkl');
	});
});
