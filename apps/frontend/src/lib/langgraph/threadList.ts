/**
 * Pure types and helpers for the thread list ("sidebar to list threads", SLG-104).
 *
 * No Svelte, no `$app`/`$env` imports — safe to unit test in Node and reuse anywhere.
 */
import type { Thread, ThreadStatus } from '@langchain/langgraph-sdk';

/** Lightweight, list-friendly projection of a LangGraph thread. */
export interface ThreadSummary {
	id: string;
	createdAt: string;
	updatedAt: string;
	status: ThreadStatus;
	metadata: Record<string, unknown>;
	/** metadata.title when SLG-117 lands; null until then. */
	title: string | null;
}

/**
 * Fields requested from `threads.search`. Kept minimal — no `values` — since the list only
 * needs enough to render a row, not full thread state.
 *
 * Note: `ThreadSelectField` isn't part of `@langchain/langgraph-sdk`'s public export surface
 * (only reachable via its internal `schema.js`), so this relies on structural typing against
 * `Client['threads']['search']`'s `select` parameter rather than an explicit type import.
 */
export const THREAD_SELECT = [
	'thread_id',
	'created_at',
	'updated_at',
	'status',
	'metadata'
] as const;

/**
 * Shape of a thread as returned by `threads.search` with {@link THREAD_SELECT}: only the
 * selected fields are guaranteed present, so `values`/`interrupts` are intentionally absent
 * from this type rather than inherited (and possibly unpopulated) from the full `Thread` type.
 */
export type SearchedThread = Pick<
	Thread<unknown>,
	'thread_id' | 'created_at' | 'updated_at' | 'status' | 'metadata'
>;

export function toThreadSummary(t: SearchedThread): ThreadSummary {
	const title = typeof t.metadata?.title === 'string' ? t.metadata.title : null;
	return {
		id: t.thread_id,
		createdAt: t.created_at,
		updatedAt: t.updated_at,
		status: t.status,
		metadata: t.metadata ?? {},
		title
	};
}

const FALLBACK_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
};

/**
 * Display label for a thread: its title when known, else its created-at date/time (also the
 * "while generating" placeholder). `locale` defaults to 'en' so callers that don't care about
 * i18n (most tests) can omit it; the component layer passes paraglide's `getLocale()`.
 *
 * Two threads created in the same minute get an identical fallback label — accepted, a
 * deliberately humane-over-unique trade-off (see the pinning test in threadList.test.ts).
 */
export function threadLabel(t: ThreadSummary, locale = 'en'): string {
	return (
		t.title ?? new Intl.DateTimeFormat(locale, FALLBACK_LABEL_FORMAT).format(new Date(t.createdAt))
	);
}
