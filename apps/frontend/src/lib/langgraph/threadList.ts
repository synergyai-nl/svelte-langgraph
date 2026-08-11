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

/** Short, human-scannable stand-in for a thread's id (first 8 chars). */
export function shortenThreadId(id: string): string {
	return id.slice(0, 8);
}

/** Display label for a thread: its title when known, else a shortened id. */
export function threadLabel(t: ThreadSummary): string {
	return t.title ?? shortenThreadId(t.id);
}
