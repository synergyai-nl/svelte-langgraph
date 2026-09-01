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

	// runId → signed feedback URL returned by /api/feedback/token. Keyed by run,
	// not by message: one token covers every message the run produced, and the
	// run id is what the score is ultimately attributed to.
	const feedbackUrls = new SvelteMap<string, string>();

	// Rating is disabled until the stored ratings are known: without them the UI
	// would show an old rating as unrated, and re-rating would look like a change
	// the user didn't make.
	let ratingsLoaded = $state(false);
	let ratingsError = $state(false);

	// runId → the rating the user gave. Mirrored into thread metadata so it
	// survives a reload, because Langfuse can't serve this back: its scores API
	// has no batch-by-session query, so rebuilding a thread would cost a lookup
	// per message, and a fresh score takes ~10s to become readable anyway.
	let ratings = $state<Record<string, 'up' | 'down'>>({});

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

	/** The run that produced this message.
	 *
	 * Read from the message's own checkpoint metadata rather than from the live
	 * run, so a rating always scores the trace that actually generated the text —
	 * including for messages restored from history, where there is no live run at
	 * all. Aegra pins `configurable.run_id` on every run and LangGraph merges
	 * `configurable` into checkpoint metadata, so this survives a reload.
	 */
	function getRunId(message: Message): string | null {
		if (!message.id) return null;
		const rawMsg = rawMessageById.get(message.id);
		if (!rawMsg) return null;
		const runId = stream.getMessagesMetadata(rawMsg)?.firstSeenState?.metadata?.run_id;
		return typeof runId === 'string' && runId ? runId : null;
	}

	/** Mint (or reuse) the signed URL that authorises scoring this run. */
	async function getFeedbackUrl(runId: string): Promise<string | null> {
		const cached = feedbackUrls.get(runId);
		if (cached) return cached;

		const res = await fetch('/api/feedback/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ run_id: runId })
		});
		if (!res.ok) throw new Error(`Feedback token request failed: ${res.status}`);

		const { url } = await res.json();
		if (typeof url !== 'string' || !url) throw new Error('Feedback token response had no url');
		feedbackUrls.set(runId, url);
		return url;
	}

	/** Ratings live in thread metadata (PATCH /threads/{id}) rather than thread
	 *  state. State would mean a checkpoint write, which forks history on the next
	 *  submit and 409s during an active run — see the escape-hatch note in
	 *  stateSync.svelte.ts.
	 *
	 *  One flat `rating:<runId>` key per rating, not a nested map. Aegra merges
	 *  metadata by top-level key (`current_metadata.update(...)`), so a nested
	 *  `ratings` object would be replaced wholesale — every write would have to
	 *  resend the entire map, and any write built on a stale or failed read would
	 *  erase the rest. Flat keys make each write touch exactly one rating, so
	 *  there is nothing to lose and concurrent tabs can't clobber each other. */
	const RATING_PREFIX = 'rating:';

	function ratingsFromMetadata(metadata: unknown): Record<string, 'up' | 'down'> {
		const entries = Object.entries((metadata as Record<string, unknown>) ?? {});
		const found: Record<string, 'up' | 'down'> = {};
		for (const [key, value] of entries) {
			if (!key.startsWith(RATING_PREFIX)) continue;
			if (value === 'up' || value === 'down') found[key.slice(RATING_PREFIX.length)] = value;
		}
		return found;
	}

	async function loadRatings() {
		try {
			const thread = await langGraphClient.threads.get(threadId);
			// Merge under, never over: a rating given while this was in flight is
			// newer than the server's copy.
			ratings = { ...ratingsFromMetadata(thread.metadata), ...ratings };
		} catch (err) {
			// The buttons stay disabled, so a rating can't be given against an
			// unknown baseline and then appear to vanish on reload.
			console.error('Failed to load feedback ratings', err);
			ratingsError = true;
			return;
		}
		ratingsLoaded = true;
	}
	loadRatings();

	function getRating(message: Message): 'up' | 'down' | null {
		const runId = getRunId(message);
		return runId ? (ratings[runId] ?? null) : null;
	}

	/** Which runs have a rating in flight or just failed, so the buttons can show
	 *  it. Keyed by run for the same reason `ratings` is. */
	let pendingRuns = $state<Record<string, true>>({});
	let failedRuns = $state<Record<string, true>>({});

	function getFeedbackStatus(message: Message): 'pending' | 'failed' | null {
		const runId = getRunId(message);
		if (!runId) return null;
		if (pendingRuns[runId]) return 'pending';
		return failedRuns[runId] ? 'failed' : null;
	}

	function setFlag(flags: Record<string, true>, runId: string, on: boolean): Record<string, true> {
		const next = { ...flags };
		if (on) next[runId] = true;
		else delete next[runId];
		return next;
	}

	async function handleFeedback(message: Message, type: 'up' | 'down') {
		const runId = getRunId(message);
		if (!runId) {
			console.error('No run id for message, cannot submit feedback', message.id);
			return;
		}

		const previous = ratings[runId];
		// Optimistic: the highlight belongs on the click, not a round trip later.
		ratings = { ...ratings, [runId]: type };
		pendingRuns = setFlag(pendingRuns, runId, true);
		failedRuns = setFlag(failedRuns, runId, false);

		try {
			// Minted on demand rather than eagerly for every message: most messages
			// are never rated, and a token has a TTL it would otherwise burn idle.
			const url = await getFeedbackUrl(runId);
			if (!url) return;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ score: type })
			});
			if (!res.ok) throw new Error(`Feedback submission failed: ${res.status}`);
		} catch (err) {
			// The score is what the rating is *for*, so this is the failure worth
			// showing. Roll back only this message; others may have landed since.
			const rolledBack = { ...ratings };
			if (previous === undefined) delete rolledBack[runId];
			else rolledBack[runId] = previous;
			ratings = rolledBack;
			failedRuns = setFlag(failedRuns, runId, true);
			console.error('Failed to submit feedback', err);
			return;
		} finally {
			pendingRuns = setFlag(pendingRuns, runId, false);
		}

		// Deliberately after the block above, and not surfaced to the user: the
		// score is already recorded, so this failing costs the highlight on the
		// next load, not the rating. Reporting it would claim the click was lost
		// when it wasn't, and re-arm the button to post a duplicate score.
		try {
			// Only this run's key — see RATING_PREFIX above.
			await langGraphClient.threads.update(threadId, {
				metadata: { [`${RATING_PREFIX}${runId}`]: type }
			});
		} catch (err) {
			console.error('Failed to persist feedback rating', err);
		}
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

	$effect(() => {
		if (!threadListRefresh) return;
		const loading = stream.isLoading;
		const settled = wasLoading && !loading;
		wasLoading = loading;
		if (settled) untrack(() => threadListRefresh.refresh());
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
				onFeedback={handleFeedback}
				{getRating}
				{getFeedbackStatus}
				feedbackReady={ratingsLoaded}
				{ratingsError}
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
