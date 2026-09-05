/**
 * Reactive thread list state (SLG-104).
 *
 * House pattern: private `$state` fields + getters, no `$effect` inside the class (constructed
 * outside components — see stateSync.svelte.test.ts precedent, `$effect` there throws
 * `effect_orphan`). The route/layout adapter owns the single wiring effect that calls
 * `setClient`.
 *
 * Server already scopes every `threads.search` to the caller (global `add_owner` handler), so
 * no client-side owner/metadata filter is added here. Busy/interrupted threads intentionally
 * stay in the list — no `status` filter either.
 */
import type { Client } from '@langchain/langgraph-sdk';
import {
	THREAD_SELECT,
	toThreadSummary,
	type SearchedThread,
	type ThreadSummary
} from './threads.js';

export interface ThreadListOptions {
	/** Page size for `threads.search`. Defaults to 20. */
	pageSize?: number;
	/**
	 * Start in the loading state — set when a client is expected but hasn't arrived yet (SSR,
	 * where the wiring `$effect` never runs). Cleared by `setClient(null)`.
	 */
	initialLoading?: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

/** The `threads.search` query shape, minus the bits `#search` manages itself. */
type ThreadSearchQuery = NonNullable<Parameters<Client['threads']['search']>[0]>;
type BaseQuery = Omit<ThreadSearchQuery, 'signal' | 'select'>;

/**
 * A rejected `threads.search` typically surfaces the raw `Response` (see
 * `@langchain/core`'s `AsyncCaller.fetch`), not an `Error`. A `select` value the server itself
 * rejects as invalid comes back as HTTP 422 — both of `langgraph-api`'s validation layers
 * (the jsonschema request handler and `validate_select_columns`) use 422, never 400 — so that's
 * the only status worth permanently latching on. Everything else (5xx, 408/429, network,
 * unclassified) is transient or unrelated to `select` itself; latching those would permanently
 * (and wrongly) fall back to full thread payloads after a blip.
 */
function rejectedParameter(err: unknown): boolean {
	const status =
		typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
			? err.status
			: undefined;
	return status === 422;
}

export class ThreadListState {
	#threads = $state<ThreadSummary[]>([]);
	#loading = $state(false);
	#error = $state<Error | null>(null);
	#hasMore = $state(false);
	/**
	 * The active thread, fetched on its own when it falls outside the loaded pages (e.g. a
	 * bookmarked old thread). Rendered at the top of `threads`, unconditionally — the page is a
	 * *window* onto an `updated_at desc` collection, so merging an out-of-window thread "in
	 * rank order" would require knowing its position among potentially thousands of unfetched
	 * rows. Pinning at the top is the standard treatment for "your selection isn't in the
	 * visible window".
	 */
	#pinned = $state<ThreadSummary | null>(null);

	readonly #pageSize: number;
	/**
	 * `undefined` means "never set". Distinct from `null` ("explicitly cleared") so the very
	 * first `setClient(null)` call — e.g. a signed-out SSR pass — isn't swallowed by the
	 * identity no-op below and still clears `initialLoading`.
	 */
	#client: Client | null | undefined = undefined;
	#activeThreadId: string | null = null;
	#nextOffset = 0;
	/** The last request that failed, replayed by `retry()`. Cleared on any successful load. */
	#failedRequest: { offset: number; replace: boolean } | null = null;
	#controller: AbortController | null = null;
	#pinController: AbortController | null = null;
	/** Id of the thread currently being pin-fetched, if any — guards duplicate concurrent fetches. */
	#pinFetchId: string | null = null;
	/** Latch: once the server/SDK rejects `select`, stop sending it for all later requests. */
	#supportsSelect = true;
	#warnedAboutSelect = false;

	constructor(options?: ThreadListOptions) {
		this.#pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
		this.#loading = options?.initialLoading ?? false;
	}

	get threads(): ThreadSummary[] {
		if (this.#pinned && !this.#threads.some((t) => t.id === this.#pinned!.id)) {
			return [this.#pinned, ...this.#threads];
		}
		return this.#threads;
	}

	get loading(): boolean {
		return this.#loading;
	}

	get error(): Error | null {
		return this.#error;
	}

	get hasMore(): boolean {
		return this.#hasMore;
	}

	/**
	 * Swap the active client. Identity no-op if unchanged. Aborts any in-flight request, resets
	 * state, and loads page 0 for the new client (or just clears state when `next` is null).
	 */
	setClient(next: Client | null): void {
		if (next === this.#client) return;

		this.#abortInFlight();
		this.#abortPin();
		this.#client = next;
		this.#threads = [];
		this.#pinned = null;
		this.#error = null;
		this.#hasMore = false;
		this.#nextOffset = 0;

		if (next) {
			this.#load({ offset: 0, replace: true });
			this.#reconcilePin();
		} else {
			this.#loading = false;
		}
	}

	/**
	 * Record which thread is "active" (e.g. the one currently open) so it can be pinned to the
	 * top of the list when it falls outside the loaded pages. Identity no-op like `setClient`.
	 */
	setActiveThreadId(id: string | null): void {
		if (id === this.#activeThreadId) return;
		this.#activeThreadId = id;
		this.#reconcilePin();
	}

	/** Abort any in-flight request and reload page 0, replacing the current list. */
	refresh(): void {
		this.#abortInFlight();
		this.#nextOffset = 0;
		this.#load({ offset: 0, replace: true });
		this.#reconcilePin();
	}

	/** Fetch the next page and append. No-op while loading or when there's no more to fetch. */
	loadMore(): void {
		if (this.#loading || !this.#hasMore) return;
		this.#load({ offset: this.#nextOffset, replace: false });
	}

	/**
	 * Re-run whichever request last failed, whether that was a page fetch or a refresh.
	 *
	 * Not the same as `loadMore()`: a failed `refresh()` leaves `#nextOffset` back at 0 while
	 * `#hasMore` keeps the value from the last *successful* load, so retrying it as a pagination
	 * step would either no-op outright (when `hasMore` is false) or re-request offset 0 with
	 * `replace: false`, where `dedupeById` keeps the existing entries and the stale rows and
	 * ordering survive untouched. Replaying the recorded request avoids both.
	 *
	 * Falls back to a full refresh when nothing has failed, so the button is never inert.
	 */
	retry(): void {
		if (this.#loading) return;

		const failed = this.#failedRequest;
		if (!failed) {
			this.refresh();
			return;
		}

		this.#load(failed);
		if (failed.replace) this.#reconcilePin();
	}

	/** Abort any in-flight request. Call when the owning component/context goes away. */
	dispose(): void {
		this.#abortInFlight();
		this.#abortPin();
		this.#loading = false;
	}

	#abortInFlight(): void {
		this.#controller?.abort();
		this.#controller = null;
	}

	#abortPin(): void {
		this.#pinController?.abort();
		this.#pinController = null;
		this.#pinFetchId = null;
	}

	/**
	 * The one reconciliation point for the pin: clears it when there's nothing to pin (no active
	 * thread, or the active thread is already visible in the loaded pages), otherwise fires an
	 * `ids`-scoped fetch for it. Called from `setActiveThreadId`, `setClient`, `refresh`, and
	 * `#load`'s success callback — covering the initial load, `loadMore`, and `refresh` at once,
	 * since all three funnel through `#load`.
	 */
	#reconcilePin(): void {
		const id = this.#activeThreadId;

		if (id === null || this.#threads.some((t) => t.id === id)) {
			this.#pinned = null;
			this.#abortPin();
			return;
		}

		// Already pinned this exact thread, or already fetching it — nothing to do.
		if (this.#pinned?.id === id || this.#pinFetchId === id) return;

		if (!this.#client) return; // setClient will reconcile again once a client arrives.

		this.#fetchPin(this.#client, id);
	}

	#fetchPin(client: Client, id: string): void {
		this.#abortPin();
		const controller = new AbortController();
		this.#pinController = controller;
		this.#pinFetchId = id;

		void this.#search(client, { ids: [id], limit: 1 }, controller.signal)
			.then((results) => {
				if (controller.signal.aborted) return;
				// The active thread may have moved on again while this fetch was in flight; if so,
				// whatever superseded it already called #abortPin() to clear #pinFetchId.
				if (this.#activeThreadId !== id) return;

				this.#pinFetchId = null;
				this.#pinned = results.length > 0 ? toThreadSummary(results[0]) : null;
			})
			.catch((err) => {
				if (controller.signal.aborted) return;
				if (this.#activeThreadId !== id) return;

				this.#pinFetchId = null;
				// A missing highlight isn't worth flipping the whole sidebar into its error state —
				// this covers both real failures and a foreign/deleted id (empty result is "nothing
				// to pin", handled above, not here).
				console.warn(
					'Failed to fetch the active thread for pinning; it may be missing from the sidebar until it appears in a loaded page.',
					err
				);
			});
	}

	#load({ offset, replace }: { offset: number; replace: boolean }): void {
		const client = this.#client;
		if (!client) return;

		const controller = new AbortController();
		this.#controller = controller;
		this.#loading = true;
		this.#error = null;

		void this.#search(
			client,
			{ limit: this.#pageSize, offset, sortBy: 'updated_at', sortOrder: 'desc' },
			controller.signal
		)
			.then((results) => {
				if (controller.signal.aborted) return;

				const summaries = results.map(toThreadSummary);
				this.#threads = replace ? summaries : dedupeById([...this.#threads, ...summaries]);
				this.#hasMore = results.length === this.#pageSize;
				this.#nextOffset = offset + this.#pageSize;
				this.#loading = false;
				this.#failedRequest = null;
				this.#reconcilePin();
			})
			.catch((err) => {
				if (controller.signal.aborted) return;

				// Remember exactly which request failed so `retry()` can replay *that* one. The
				// SDK rejects with the raw `Response` rather than an `Error`, so this wrapping
				// renders as "[object Response]" — harmless today, since the UI shows a fixed
				// label rather than the message.
				this.#failedRequest = { offset, replace };
				this.#error = err instanceof Error ? err : new Error(String(err));
				this.#loading = false;
			});
	}

	/**
	 * Shared retry/latch path for both the paged load and the pin fetch: `query` carries only
	 * what differs between them (`{ limit, offset, sortBy, sortOrder }` vs `{ ids, limit }`),
	 * while `select`/`signal` are managed here.
	 */
	async #search(client: Client, query: BaseQuery, signal: AbortSignal): Promise<SearchedThread[]> {
		if (!this.#supportsSelect) {
			return (await client.threads.search({ ...query, signal })) as SearchedThread[];
		}

		try {
			return (await client.threads.search({
				...query,
				signal,
				select: [...THREAD_SELECT]
			})) as SearchedThread[];
		} catch (err) {
			if (signal.aborted) throw err;

			// The `select`-bearing request failed — retry without it before concluding that
			// `select` itself is the problem. Let this throw naturally if it also fails; a
			// caller-visible error either way, and nothing to latch (see rejectedParameter below).
			const results = (await client.threads.search({ ...query, signal })) as SearchedThread[];

			if (rejectedParameter(err)) {
				this.#supportsSelect = false;
				if (!this.#warnedAboutSelect) {
					this.#warnedAboutSelect = true;
					console.warn(
						'threads.search rejected the `select` param; retrying without it and disabling it for subsequent requests.',
						err
					);
				}
			}
			return results;
		}
	}
}

function dedupeById(threads: ThreadSummary[]): ThreadSummary[] {
	const seen: Record<string, true> = {};
	const result: ThreadSummary[] = [];
	for (const t of threads) {
		if (seen[t.id]) continue;
		seen[t.id] = true;
		result.push(t);
	}
	return result;
}
