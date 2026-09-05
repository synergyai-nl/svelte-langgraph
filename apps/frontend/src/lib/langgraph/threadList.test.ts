import { describe, it, expect } from 'vitest';
import { threadLabel, toThreadSummary, type SearchedThread } from './threadList.js';

function formatFallback(createdAt: string, locale = 'en'): string {
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(createdAt));
}

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

describe('threadLabel', () => {
	it('returns the title when present', () => {
		const summary = toThreadSummary(makeSearchedThread({ metadata: { title: 'Planning trip' } }));
		expect(threadLabel(summary)).toBe('Planning trip');
	});

	it('falls back to a formatted created-at date/time when there is no title', () => {
		const createdAt = '2026-01-01T14:32:00.000Z';
		const summary = toThreadSummary(makeSearchedThread({ created_at: createdAt }));
		expect(threadLabel(summary)).toBe(formatFallback(createdAt));
	});

	it('formats the fallback label using the given locale', () => {
		const createdAt = '2026-01-01T14:32:00.000Z';
		const summary = toThreadSummary(makeSearchedThread({ created_at: createdAt }));
		expect(threadLabel(summary, 'nl')).toBe(formatFallback(createdAt, 'nl'));
	});

	// Pinning test: two untitled threads created in the same minute get the same label. A
	// conscious humane-over-unique trade-off (unlike the old hex-tail fallback, which was
	// collision-proof) — do not "fix" this by appending seconds or a hex suffix.
	it('gives two same-minute untitled threads an identical label', () => {
		const a = toThreadSummary(
			makeSearchedThread({ thread_id: 'thread-a', created_at: '2026-01-01T14:32:00.000Z' })
		);
		const b = toThreadSummary(
			makeSearchedThread({ thread_id: 'thread-b', created_at: '2026-01-01T14:32:59.000Z' })
		);

		expect(threadLabel(a)).toBe(threadLabel(b));
	});
});
