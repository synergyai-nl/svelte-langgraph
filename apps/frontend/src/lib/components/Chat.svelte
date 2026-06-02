<script lang="ts">
	import { useStream } from '@langchain/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { convertThreadMessage } from '$lib/langgraph/utils.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions, { type ChatSuggestion } from './ChatSuggestions.svelte';
	import type { Message, ToolMessage, BaseMessage } from '$lib/langgraph/types';
	import type { Client } from '@langchain/langgraph-sdk';

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

	// messageId → signed feedback URL returned by /api/feedback/token
	const feedbackUrls = new SvelteMap<string, string>();

	const stream = useStream({
		client: langGraphClient,
		assistantId,
		threadId,
		fetchStateHistory: true,
		reconnectOnMount: true,
		onFinish: async (_state, run) => {
			if (!run) return;
			// One token covers the whole run — request it once, then stamp every
			// new AI message produced by this run with the same signed URL.
			let url: string | null = null;
			for (const msg of stream.messages) {
				if (msg.type !== 'ai' || !msg.id || feedbackUrls.has(msg.id)) continue;
				try {
					if (!url) {
						const res = await fetch('/api/feedback/token', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ run_id: run.run_id })
						});
						if (!res.ok) continue;
						({ url } = await res.json());
					}
					if (url) feedbackUrls.set(msg.id, url);
				} catch (err) {
					console.error('Failed to get feedback URL for message', msg.id, err);
				}
			}
		}
	});

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

	function retryGeneration() {
		if (!last_user_message) return;
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit({ messages: [{ type: 'human', content: last_user_message }] });
	}

	function stopGeneration() {
		stream.stop();
	}

	function handleEdit(message: Message, newText: string): boolean {
		if (stream.isLoading) return false;

		// Match converted message back to the raw BaseMessage instance for metadata lookup
		const rawMsg = stream.messages.find((m) => m.id === message.id);
		if (!rawMsg) return false;

		// Submit against the parent checkpoint to branch from before this message
		const meta = stream.getMessagesMetadata(rawMsg);
		const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;

		// Snapshot AI count so final_answer_started tracks the new response correctly
		last_user_message = newText; // keep retry in sync with the edited prompt
		aiMessageCountAtSubmit = messages.filter((m) => m.type === 'ai').length;
		stream.submit(
			{ messages: [{ type: 'human', content: newText }] },
			{ checkpoint: parentCheckpoint }
		);
		return true;
	}

	async function handleFeedback(message: BaseMessage, type: 'up' | 'down') {
		const url = feedbackUrls.get(message.id);
		if (!url) {
			console.error('No feedback URL for message', message.id);
			return;
		}
		try {
			await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ score: type === 'up' ? 1 : 0 })
			});
		} catch (err) {
			console.error('Failed to submit feedback', err);
		}
	}
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col">
	<div class="flex-1 overflow-y-auto pb-24">
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
				{generationError}
				onRetryError={retryGeneration}
				onEdit={handleEdit}
				onFeedback={handleFeedback}
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
