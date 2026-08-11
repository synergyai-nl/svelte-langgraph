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
} from './threadList.js';

export interface ThreadListOptions {
	/** Page size for `threads.search`. Defaults to 20. */
	pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

export class ThreadList {
	#threads = $state<ThreadSummary[]>([]);
	#loading = $state(false);
	#error = $state<Error | null>(null);
	#hasMore = $state(false);

	readonly #pageSize: number;
	#client: Client | null = null;
	#nextOffset = 0;
	#controller: AbortController | null = null;
	/** Latch: once the server/SDK rejects `select`, stop sending it for all later requests. */
	#supportsSelect = true;
	#warnedAboutSelect = false;

	constructor(options?: ThreadListOptions) {
		this.#pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
	}

	get threads(): ThreadSummary[] {
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
		this.#client = next;
		this.#threads = [];
		this.#error = null;
		this.#hasMore = false;
		this.#nextOffset = 0;

		if (next) {
			this.#load({ offset: 0, replace: true });
		} else {
			this.#loading = false;
		}
	}

	/** Abort any in-flight request and reload page 0, replacing the current list. */
	refresh(): void {
		this.#abortInFlight();
		this.#nextOffset = 0;
		this.#load({ offset: 0, replace: true });
	}

	/** Fetch the next page and append. No-op while loading or when there's no more to fetch. */
	loadMore(): void {
		if (this.#loading || !this.#hasMore) return;
		this.#load({ offset: this.#nextOffset, replace: false });
	}

	/** Abort any in-flight request. Call when the owning component/context goes away. */
	dispose(): void {
		this.#abortInFlight();
	}

	#abortInFlight(): void {
		this.#controller?.abort();
		this.#controller = null;
	}

	#load({ offset, replace }: { offset: number; replace: boolean }): void {
		const client = this.#client;
		if (!client) return;

		const controller = new AbortController();
		this.#controller = controller;
		this.#loading = true;
		this.#error = null;

		void this.#search(client, offset, controller.signal)
			.then((results) => {
				if (controller.signal.aborted) return;

				const summaries = results.map(toThreadSummary);
				this.#threads = replace ? summaries : dedupeById([...this.#threads, ...summaries]);
				this.#hasMore = results.length === this.#pageSize;
				this.#nextOffset = offset + this.#pageSize;
				this.#loading = false;
			})
			.catch((err) => {
				if (controller.signal.aborted) return;

				this.#error = err instanceof Error ? err : new Error(String(err));
				this.#loading = false;
			});
	}

	async #search(client: Client, offset: number, signal: AbortSignal): Promise<SearchedThread[]> {
		const baseQuery = {
			limit: this.#pageSize,
			offset,
			sortBy: 'updated_at' as const,
			sortOrder: 'desc' as const,
			signal
		};

		if (!this.#supportsSelect) {
			return (await client.threads.search(baseQuery)) as SearchedThread[];
		}

		try {
			return (await client.threads.search({
				...baseQuery,
				select: [...THREAD_SELECT]
			})) as SearchedThread[];
		} catch (err) {
			if (signal.aborted) throw err;

			this.#supportsSelect = false;
			if (!this.#warnedAboutSelect) {
				this.#warnedAboutSelect = true;
				console.warn(
					'threads.search rejected the `select` param; retrying without it and disabling it for subsequent requests.',
					err
				);
			}
			return (await client.threads.search(baseQuery)) as SearchedThread[];
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
