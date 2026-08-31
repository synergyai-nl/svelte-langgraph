/**
 * `<LangGraph>` provider context (SLG-133 PR 3).
 *
 * One stable `LangGraphContext` instance per provider, constructed and set into context by
 * `LangGraph.svelte`, read by descendants via `useLangGraph()`/`useLangGraphOptional()`.
 *
 * House pattern (same as `ThreadListState`, see `threadListState.svelte.ts`): private `$state`
 * fields + public getters/setters, no `$effect` inside the class. `LangGraph.svelte` owns every
 * wiring effect (deriving the client from props, resolving the assistant, keeping the owned
 * `ThreadListState` in sync, ...) and pushes results in through the setters below — Svelte 5's
 * context rule is that the context VALUE never changes identity, only its internal reactive
 * fields do.
 */
import { getContext, setContext } from 'svelte';
import type { Client } from '@langchain/langgraph-sdk';
import {
	ThreadListState,
	createThread as createThreadRemote,
	type ThreadSummary
} from '@svelte-langgraph/client';
import type { DeepPartial, LangGraphLabels } from './labels.js';

export interface LangGraphContextOptions {
	/** Start the owned `ThreadListState` in the loading state — see `ThreadListOptions.initialLoading`. */
	initialLoading?: boolean;
}

export class LangGraphContext {
	#client = $state<Client | undefined>(undefined);
	#assistantId = $state<string | undefined>(undefined);
	/** Assistant-resolution failure surface. `undefined` when nothing has gone wrong. */
	#error = $state<unknown>(undefined);

	/** Owned thread-list instance; `LangGraph.svelte` wires `setClient`/`setActiveThreadId`. */
	readonly threadList: ThreadListState;

	/**
	 * `undefined` = uncontrolled (no `activeThreadId` prop given to `<LangGraph>`, or the prop is
	 * literally `undefined`); a `string` or `null` = controlled, the prop is the source of truth.
	 * `$state` so both `selectThread`'s mode check and the `activeThreadId` getter react when
	 * `LangGraph.svelte`'s wiring effect pushes a new prop value.
	 */
	#controlledActiveThreadId = $state<string | null | undefined>(undefined);
	#internalActiveThreadId = $state<string | null>(null);
	/** Not `$state`: only ever called imperatively from `selectThread`, never read reactively. */
	#onThreadChange: ((id: string | null) => void) | undefined;

	#pendingThreadId = $state<string | null>(null);

	#hrefFor = $state<((t: ThreadSummary) => string) | undefined>(undefined);
	#labels = $state<DeepPartial<LangGraphLabels> | undefined>(undefined);

	#creatingThread = $state(false);
	#createThreadError = $state<Error | null>(null);

	constructor(options?: LangGraphContextOptions) {
		this.threadList = new ThreadListState({ initialLoading: options?.initialLoading });
	}

	// --- client ----------------------------------------------------------------------------

	get client(): Client | undefined {
		return this.#client;
	}

	/** Pushed by `LangGraph.svelte`'s wiring effect whenever the derived client changes. */
	setClient(client: Client | undefined): void {
		this.#client = client;
	}

	// --- assistant ---------------------------------------------------------------------------

	get assistantId(): string | undefined {
		return this.#assistantId;
	}

	setAssistantId(id: string | undefined): void {
		this.#assistantId = id;
	}

	get error(): unknown {
		return this.#error;
	}

	setError(err: unknown): void {
		this.#error = err;
	}

	// --- active thread (controlled/uncontrolled) ----------------------------------------------

	get activeThreadId(): string | null {
		return this.#controlledActiveThreadId !== undefined
			? this.#controlledActiveThreadId
			: this.#internalActiveThreadId;
	}

	/**
	 * Pushed by `LangGraph.svelte`'s wiring effect on every render with the current
	 * `activeThreadId`/`onThreadChange` props. `value === undefined` means the prop was not given
	 * (uncontrolled mode); `null` or a string means it was (controlled) — standard
	 * controlled-component semantics.
	 *
	 * Any navigation to a different thread — including the one a successful `createThread()`
	 * performs via `selectThread` — supersedes whatever `ThreadList`'s default "New chat" wiring
	 * was reporting, so a stale `createThreadError` is cleared here (mirrors the old
	 * `+layout.svelte`'s `$effect(() => { void activeThreadId; createError = null; })`). Compared
	 * against the *effective* `activeThreadId`, not the raw prop, so this fires once per actual
	 * change rather than once per wiring-effect run.
	 */
	setActiveThreadIdProp(
		value: string | null | undefined,
		onThreadChange: ((id: string | null) => void) | undefined
	): void {
		const previousActive = this.activeThreadId;
		this.#controlledActiveThreadId = value;
		this.#onThreadChange = onThreadChange;
		if (this.activeThreadId !== previousActive) {
			this.#createThreadError = null;
		}
	}

	/**
	 * Select a thread. In uncontrolled mode this updates the internal state directly so
	 * `activeThreadId` reflects it immediately; in controlled mode the caller owns
	 * `activeThreadId` and is expected to react to `onThreadChange` to move it. Either way,
	 * `onThreadChange` always fires when given.
	 */
	selectThread(id: string | null): void {
		if (this.#controlledActiveThreadId === undefined) {
			this.#internalActiveThreadId = id;
		}
		this.#onThreadChange?.(id);
	}

	// --- thread creation ---------------------------------------------------------------------

	get creatingThread(): boolean {
		return this.#creatingThread;
	}

	get createThreadError(): Error | null {
		return this.#createThreadError;
	}

	/**
	 * Create a new thread, refresh the thread list, and select it. Mirrors the old
	 * `+layout.svelte`'s `handleNewThread`: never throws — resolves `false` on failure so a
	 * default-wired `ThreadList`'s `onNewThread` keeps its mobile drawer open (see
	 * `ThreadList.svelte`) — and records the failure on `createThreadError` for a caller that
	 * wants to surface it.
	 *
	 * `busy` only disables the "New chat" button, not the thread rows (see `ThreadList.svelte`),
	 * so the user can navigate away while this is still in flight. A failure landing after such a
	 * navigation would otherwise render a stale error over the newly opened thread — and
	 * `setActiveThreadIdProp`'s clear-on-navigate can't catch it, since `activeThreadId` won't
	 * change again after that — so `startedFrom` drops it instead of showing it.
	 */
	async createThread(): Promise<boolean> {
		const client = this.#client;
		if (!client) return false;

		const startedFrom = this.activeThreadId;
		this.#creatingThread = true;
		this.#createThreadError = null;
		try {
			const thread = await createThreadRemote(client);
			this.threadList.refresh();
			this.selectThread(thread.thread_id);
			return true;
		} catch (err) {
			if (this.activeThreadId === startedFrom) {
				this.#createThreadError = err instanceof Error ? err : new Error(String(err));
			}
			return false;
		} finally {
			this.#creatingThread = false;
		}
	}

	// --- pending (history-loading) row ---------------------------------------------------------

	get pendingThreadId(): string | null {
		return this.#pendingThreadId;
	}

	/** Folds the old `threadLoadingContext` semantics: report a thread's history-loading state. */
	setThreadLoading(threadId: string, loading: boolean): void {
		if (loading) this.#pendingThreadId = threadId;
		else if (this.#pendingThreadId === threadId) this.#pendingThreadId = null;
	}

	// --- pass-through props ------------------------------------------------------------------

	get hrefFor(): ((t: ThreadSummary) => string) | undefined {
		return this.#hrefFor;
	}

	setHrefFor(fn: ((t: ThreadSummary) => string) | undefined): void {
		this.#hrefFor = fn;
	}

	get labels(): DeepPartial<LangGraphLabels> | undefined {
		return this.#labels;
	}

	setLabels(labels: DeepPartial<LangGraphLabels> | undefined): void {
		this.#labels = labels;
	}

	/** Call on the provider's destroy. */
	dispose(): void {
		this.threadList.dispose();
	}
}

const KEY = Symbol.for('slg-langgraph');

export function setLangGraphContext(ctx: LangGraphContext): LangGraphContext {
	return setContext(KEY, ctx);
}

/** Read the `<LangGraph>` context. Throws when called outside a provider. */
export function useLangGraph(): LangGraphContext {
	const ctx = getContext<LangGraphContext | undefined>(KEY);
	if (!ctx) {
		throw new Error('useLangGraph() must be called within a <LangGraph> provider.');
	}
	return ctx;
}

/** Read the `<LangGraph>` context, or `undefined` outside a provider. */
export function useLangGraphOptional(): LangGraphContext | undefined {
	return getContext<LangGraphContext | undefined>(KEY);
}
