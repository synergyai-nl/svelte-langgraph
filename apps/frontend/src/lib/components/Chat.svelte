<script lang="ts">
	import { useStream } from '@langchain/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { convertThreadMessage } from '$lib/langgraph/utils.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions, { type ChatSuggestion } from './ChatSuggestions.svelte';
	import type { Message, ToolMessage } from '$lib/langgraph/types';
	import type { Client, Checkpoint } from '@langchain/langgraph-sdk';
	import { InvalidData } from '$lib/langgraph/errors';
	import { createStateSync } from '$lib/langgraph/stateSync.svelte.js';
	import { getThreadListRefresh } from '$lib/langgraph/threadListContext';
	import { getThreadLoadingReporter } from '$lib/langgraph/threadLoadingContext';
	import { onDestroy, untrack } from 'svelte';
	import StateField from './StateField.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		threadId: string;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	let {
		langGraphClient,
		assistantId,
		threadId,
		suggestions = [],
		intro = '',
		introTitle = ''
	}: Props = $props();

	const stream = useStream({
		client: langGraphClient,
		assistantId,
		threadId,
		fetchStateHistory: true,
		reconnectOnMount: true
	});

	const sync = createStateSync({ stream, client: langGraphClient, assistantId });

	let current_input = $state('');
	let last_user_message = $state('');
	let aiMessageCountAtSubmit = $state(0);

	function mapMessages(msgs: typeof stream.messages): Message[] {
		const toolCallArgs = new SvelteMap<string, Record<string, unknown>>();
		const result: Message[] = [];

		for (const msg of msgs) {
			const m = msg as unknown as Record<string, unknown>;

			if ((m.type === 'ai' || m.type === 'AIMessageChunk') && Array.isArray(m.tool_calls)) {
				for (const tc of m.tool_calls as Array<{ id?: string; args?: Record<string, unknown> }>) {
					if (tc.id) toolCallArgs.set(tc.id, tc.args ?? {});
				}
			}

			try {
				const normalized = m.type === 'AIMessageChunk' ? { ...m, type: 'ai' } : m;
				const converted = convertThreadMessage(normalized);
				if (converted.type === 'tool') {
					(converted as ToolMessage).payload = toolCallArgs.get(converted.id);
				}
				result.push(converted);
			} catch {
				// Skip unconvertible messages (e.g. unexpected types during streaming)
			}
		}

		return result;
	}

	let messages = $derived(mapMessages(stream.messages));
	let rawMessageById = $derived(
		new Map(stream.messages.flatMap((m) => (m.id ? ([[m.id, m]] as const) : [])))
	);

	function isCancellationError(err: unknown): boolean {
		if (err instanceof Error) {
			return err.name === 'CancelledError' || err.name === 'AbortError';
		}
		// Python server stores cancellation as a raw string in thread task history
		const str = String(err);
		return str.includes('CancelledError') || str.includes('AbortError');
	}

	let generationError = $derived(
		!isCancellationError(stream.error) && stream.error != null
			? stream.error instanceof Error
				? stream.error
				: new Error(String(stream.error))
			: null
	);

	let chat_started = $derived(messages.length > 0 || stream.isLoading || generationError != null);
	let final_answer_started = $derived(
		!stream.isLoading || messages.filter((m) => m.type === 'ai').length > aiMessageCountAtSubmit
	);

	function submitInput(text: string) {
		if (!text.trim() || stream.isLoading) return;
		last_user_message = text;
		current_input = '';
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit({ messages: [{ type: 'human', content: text }] });
	}

	function retryGenerationAfterError() {
		if (!last_user_message) return;
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit({ messages: [{ type: 'human', content: last_user_message }] });
	}

	function stopGeneration() {
		stream.stop();
	}

	function getParentCheckpoint(message: Message): Checkpoint | null {
		if (!message.id) throw new InvalidData('Message is missing an id', message);
		const rawMsg = rawMessageById.get(message.id);
		if (!rawMsg) throw new InvalidData('Raw message not found for id: ' + message.id, message);
		const metadata = stream.getMessagesMetadata(rawMsg);
		if (!metadata)
			throw new InvalidData('No metadata found for message id: ' + message.id, message);
		// parent_checkpoint is the state just before this message — branching from it replaces the message onwards
		return metadata.firstSeenState?.parent_checkpoint ?? null;
	}

	function handleEdit(message: Message, newText: string): boolean {
		if (stream.isLoading) return false;
		const parentCheckpoint = getParentCheckpoint(message);
		if (!parentCheckpoint) return false;
		// Snapshot AI count so final_answer_started tracks the new response correctly
		last_user_message = newText; // keep retry in sync with the edited prompt
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit(
			{ messages: [{ type: 'human', content: newText }] },
			{ checkpoint: parentCheckpoint }
		);
		return true;
	}

	function handleRegenerate(message: Message) {
		if (stream.isLoading) return;
		const parentCheckpoint = getParentCheckpoint(message);
		if (!parentCheckpoint) return;
		// last_user_message is intentionally not updated here — retryGenerationAfterError only
		// applies to user-initiated sends, not regenerations
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit(undefined, { checkpoint: parentCheckpoint });
	}

	// Nudge the sidebar's thread list once a run settles, so a freshly titled/updated/regenerated
	// thread moves to the top. Fires on the isLoading true→false edge — not on message-count
	// changes — so a same-length regenerate still refreshes. Safe against the initial history
	// fetch: `isLoading` reflects only an active run, never the separate history hydration
	// (`isThreadLoading`). The context is optional: Chat renders fine (and stays testable)
	// without it.
	//
	// This fires on every settle within the mount, including a stop()-cancelled or errored run
	// (both flip `isLoading` through the same finally as a successful completion) — a few extra
	// `threads.search` calls in exchange for correctness. Don't "optimize" this back to a
	// success-only check.
	const threadListRefresh = getThreadListRefresh();
	let wasLoading = false;

	// --- Thread title mirroring (SLG-117) ---
	//
	// The graph writes a generated title into state under `title` (surfaced here as
	// `stream.values.title`). `threads.search` — what the sidebar list is built from — never
	// returns `values`, only `metadata`, so the title has to be copied into thread metadata to be
	// visible there. `client.threads.update` is Aegra's shallow merge (`current_metadata.update`),
	// so sending only `{ title }` cannot clobber the `owner` key the backend auth stamps.
	//
	// `mirroredTitle` remembers what this instance has already *successfully* written, so a later
	// settle with an unchanged title (e.g. a follow-up turn before the graph updates it again)
	// doesn't reissue an identical PATCH. A failed PATCH is swallowed — a missing/stale title is
	// purely cosmetic and must never surface as a chat error.
	//
	// It is recorded only after the PATCH resolves, which is what makes a transient failure
	// recoverable *within this mount*: the next settle sees `title !== mirroredTitle` and retries.
	// Recording it up front would be a silent one-shot — on a fresh thread the mount-time check
	// has already run (and set `checkedInitialTitle`) before the title ever existed, so it cannot
	// act as the safety net here, and the thread would stay untitled until the next page load.
	let mirroredTitle: string | undefined;

	// Every metadata write *and* the mount-time decision that gates them run through this one
	// chain, rather than being fired off independently.
	//
	// Serializing the writes alone is not enough. Two settles can leave two PATCHes in flight —
	// reachable via regenerate, which branches from the pre-answer checkpoint and so generates a
	// *different* title (see `test_regenerate_reexecutes_model`) — and Aegra's metadata write is
	// last-write-wins, so a slower first PATCH landing second persists the stale title. But the
	// mount-time `threads.get` that decides whether a stored title is authoritative is *also*
	// async: a run settling while that GET was still open found `suppressedGraphTitle` unset and
	// wrote the generated title straight over a rename. Putting the decision on the same chain is
	// what fixes that — later writes queue behind it and observe its result.
	//
	// (A settle enqueued *before* hydration completes still runs first, since the decision has
	// not been queued yet. That needs a run to settle before its own thread's history finishes
	// loading, which the UI does not offer a way to do.)
	let mirrorQueue: Promise<void> = Promise.resolve();

	function enqueue(task: () => Promise<void>): Promise<void> {
		// A rejected link must not poison the chain for later work. (Nothing queued here actually
		// rejects — the write swallows its own errors — but this keeps that a local property
		// rather than an invariant every caller has to preserve.)
		mirrorQueue = mirrorQueue.catch(() => {}).then(task);
		return mirrorQueue;
	}

	// The one graph title we have deliberately declined to mirror, because the thread already
	// carried a different stored title (see the mount backfill below). Without this, recording
	// the stored title in `mirroredTitle` is not enough on its own: the very next settle would
	// see `stream.values.title !== mirroredTitle` and PATCH the generated title straight back
	// over the rename, so merely reopening a renamed thread and sending a follow-up message
	// would undo it.
	//
	// Keyed on the *value*, not a boolean, so it suppresses exactly the title we already judged
	// non-authoritative. A genuinely regenerated title is a different string, so it still gets
	// mirrored — suppressing by flag would have silently disabled titling for the rest of the
	// mount instead.
	let suppressedGraphTitle: string | undefined;

	/** The actual PATCH. Only ever called from inside a queued task. */
	async function writeTitle(title: string): Promise<void> {
		// Checked here, not by the caller: by the time this runs, an earlier queued write may
		// already have persisted this exact title.
		if (title === mirroredTitle) return;
		try {
			await langGraphClient.threads.update(threadId, { metadata: { title } });
			mirroredTitle = title;
		} catch {
			// Best-effort — see comment above. Leaving `mirroredTitle` unset is deliberate: it
			// lets the next settle retry, and the mount-time check below covers a tab closed
			// mid-run.
		}
	}

	$effect(() => {
		const loading = stream.isLoading;
		const settled = wasLoading && !loading;
		wasLoading = loading;
		if (!settled) return;
		untrack(() => {
			const title = stream.values.title;
			void (async () => {
				// No title to mirror — refresh straight away rather than queueing a no-op behind
				// whatever else is in flight. This is the overwhelmingly common settle.
				if (typeof title === 'string' && title.length > 0) {
					// Await the write before refreshing — that's what makes the sidebar pick up the
					// new title on this refresh instead of the next one.
					await enqueue(async () => {
						// Checked *inside* the queue so it observes the mount-time decision rather
						// than a snapshot taken before that decision had resolved.
						if (title === suppressedGraphTitle) return;
						await writeTitle(title);
					});
				}
				threadListRefresh?.refresh();
			})();
		});
	});

	// One-time backfill, checked once history hydration finishes (`isThreadLoading` true→false).
	// This is the *only* safety net for a settle-time PATCH above that itself failed (network
	// blip, Aegra briefly down) — that path only ever tries once per settle — and it's also what
	// makes a tab closed mid-run (before any settle fires) self-heal its title on next open.
	//
	// Deliberately checks the thread's *stored* metadata via `threads.get` first rather than
	// blind-PATCHing: `stream.values.title` alone can't tell us whether the mirror already
	// happened (e.g. on a previous mount), and blind-PATCHing on every mount of an already-titled
	// thread would mean a write on every thread open — the overwhelmingly common case.
	let checkedInitialTitle = false;

	$effect(() => {
		const threadLoading = stream.isThreadLoading;
		if (threadLoading || checkedInitialTitle) return;
		checkedInitialTitle = true;
		untrack(() => {
			const title = stream.values.title;
			if (typeof title !== 'string' || title.length === 0 || title === mirroredTitle) return;
			let backfilled = false;
			void (async () => {
				// Enqueued, not detached: settle-time writes must queue behind this decision, or a
				// run settling while the GET below is still open would write the generated title
				// over a rename before we had established that one exists.
				await enqueue(async () => {
					try {
						// Any stored metadata title is authoritative, not just one matching ours. This
						// backfill exists to fill an *absence* (a PATCH that failed, or a tab closed
						// mid-run), so a thread that already carries a title is simply done. Comparing
						// for equality instead would overwrite a title set deliberately elsewhere —
						// `client.threads.update` is public SDK surface, so another client or tab can
						// rename a thread today, and the rename UI noted as a follow-up would be
						// silently undone every time the thread was reopened.
						const thread = await langGraphClient.threads.get(threadId);
						const storedTitle = thread.metadata?.title;
						if (typeof storedTitle === 'string' && storedTitle.length > 0) {
							mirroredTitle = storedTitle;
							// Also suppress this graph title on later settles — see
							// `suppressedGraphTitle`.
							suppressedGraphTitle = title;
							return;
						}
					} catch {
						// Can't tell whether a mirror is needed — skip rather than risk a redundant
						// PATCH. The next mount gets another chance.
						return;
					}
					// `title` was captured before the awaited GET, and the graph's title can move on
					// while that GET is open — a regenerate branches from the pre-answer checkpoint
					// and produces a *different* title, which a settle will have written. The GET
					// returns a snapshot predating that, so writing the captured title here would
					// overwrite the newer one. Re-read instead and drop the backfill if it is stale.
					if (stream.values.title !== title) return;
					await writeTitle(title);
					backfilled = true;
				});
				if (backfilled) threadListRefresh?.refresh();
			})();
		});
	});

	// Report history-loading state up so the sidebar can mark this thread's row as pending.
	// `threadId` is fixed per instance — the route remounts Chat via `{#key threadId}`.
	const reporter = getThreadLoadingReporter();

	$effect(() => {
		reporter?.setLoading(threadId, stream.isThreadLoading);
	});

	onDestroy(() => reporter?.setLoading(threadId, false));
</script>

<div class="flex h-full min-h-0 flex-col">
	<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
	<div class="flex justify-end px-4 py-1">
		<StateField name="phase" field={sync.field('phase')} />
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={stream.isThreadLoading}>
		{#if stream.isThreadLoading}
			<div data-testid="chat-history-loading" class="mx-auto w-full max-w-4xl space-y-4 p-4">
				<p class="sr-only" role="status" aria-live="polite">{m.chat_history_loading()}</p>
				<div class="bg-muted h-16 w-3/4 animate-pulse rounded-lg"></div>
				<div class="bg-muted h-16 w-full animate-pulse rounded-lg"></div>
				<div class="bg-muted h-16 w-1/2 animate-pulse rounded-lg"></div>
			</div>
		{:else if !chat_started}
			<ChatSuggestions
				{suggestions}
				{introTitle}
				{intro}
				onSuggestionClick={(suggestedText) => submitInput(suggestedText)}
			/>
		{:else}
			<ChatMessages
				{messages}
				finalAnswerStarted={final_answer_started}
				isStreaming={stream.isLoading}
				{generationError}
				onRetryError={retryGenerationAfterError}
				onEdit={handleEdit}
				onRegenerate={handleRegenerate}
			/>
		{/if}
	</div>
	<ChatInput
		bind:value={current_input}
		isStreaming={stream.isLoading}
		onSubmit={() => submitInput(current_input)}
		onStop={() => stopGeneration()}
	/>
</div>
