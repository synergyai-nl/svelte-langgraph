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
	// `mirroredTitle` remembers what this instance has already written, so a later settle with an
	// unchanged title (e.g. a follow-up turn before the graph updates it again) doesn't reissue an
	// identical PATCH. A failed PATCH is swallowed — a missing/stale title is purely cosmetic and
	// backfills on the next settle or the next mount, so it must never surface as a chat error.
	let mirroredTitle: string | undefined;

	async function mirrorTitle(title: string) {
		mirroredTitle = title;
		try {
			await langGraphClient.threads.update(threadId, { metadata: { title } });
		} catch {
			// Best-effort — see comment above. The mount-time check below is the safety net for
			// exactly this case.
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
				// Await the PATCH before refreshing — that's what makes the sidebar pick up the new
				// title on this refresh instead of the next one.
				if (typeof title === 'string' && title.length > 0 && title !== mirroredTitle) {
					await mirrorTitle(title);
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
			void (async () => {
				try {
					const thread = await langGraphClient.threads.get(threadId);
					if (thread.metadata?.title === title) {
						mirroredTitle = title;
						return;
					}
				} catch {
					// Can't tell whether a mirror is needed — skip rather than risk a redundant PATCH.
					// The next mount gets another chance.
					return;
				}
				await mirrorTitle(title);
				threadListRefresh?.refresh();
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
