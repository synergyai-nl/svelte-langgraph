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
	import { untrack } from 'svelte';
	import StateField from './StateField.svelte';

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

	// Nudge the sidebar's thread list once a run settles, so a freshly titled/updated thread moves
	// to the top. The context is optional: Chat renders fine (and stays testable) without it.
	//
	// Gated on `sawRun`: Chat remounts per thread (`{#key threadId}`), so on mount the initial
	// history fetch can bump `messages.length` from 0 while `isLoading` never goes true this
	// mount — that's hydration, not a run settling, and must not trigger a refresh. `sawRun` only
	// flips true once this mount has actually observed `stream.isLoading` go true; only then does
	// a later settle (isLoading false, signature changed) call refresh(). Until then, settles just
	// record the baseline signature silently.
	const threadListRefresh = getThreadListRefresh();
	let lastNotifiedSignature = '';
	let sawRun = false;

	$effect(() => {
		if (!threadListRefresh) return;
		// Only notify once the run has settled — mid-stream the server state is still in flux.
		if (stream.isLoading) {
			sawRun = true;
			return;
		}

		const signature = `${threadId}:${messages.length}`;
		const previous = untrack(() => lastNotifiedSignature);
		lastNotifiedSignature = signature;
		if (signature === previous) return;

		// No run has settled this mount yet — this is hydration, not a change to notify about.
		if (!sawRun) return;

		untrack(() => threadListRefresh.refresh());
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<!-- Slim state-field bar — renders nothing when schema is unavailable (degraded mode) -->
	<div class="flex justify-end px-4 py-1">
		<StateField name="phase" field={sync.field('phase')} />
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto pb-4">
		{#if !chat_started}
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
