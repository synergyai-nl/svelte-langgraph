<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '$lib/langgraph/streamAnswer.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions, { type ChatSuggestion } from './ChatSuggestions.svelte';
	import type { Message, UserMessage } from '$lib/langgraph/types';

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

	let current_input = $state('');
	let is_streaming = $state(false);
	let final_answer_started = $state(false);
	let messages = $state<Array<Message>>([]);
	let chat_started = $state(false);
	let generation_error = $state<Error | null>(null);
	let last_user_message = $state<string>('');

	function updateMessages(chunk: Message) {
		console.debug('Processing chunk in inputSubmit:', chunk);

		// Look for existing message with same id
		const messageIndex = messages.findIndex((m) => m.id === chunk.id);

		if (messageIndex == -1) {
			// New message
			messages.push(chunk);
		} else {
			// Update existing message
			const existing = messages[messageIndex];
			if (chunk.text) {
				existing.text += chunk.text;
			}

			if (existing.type == 'tool' && 'status' in chunk) {
				existing.status = chunk.status;
			}
		}

		if (!final_answer_started && chunk.type == 'ai' && chunk.text) final_answer_started = true;

		// Trigger reactivity
		messages = [...messages];
	}

	async function inputSubmit() {
		if (current_input) {
			chat_started = true;

			const userMessage: UserMessage = {
				type: 'user',
				text: current_input,
				id: crypto.randomUUID()
			};
			messages.push(userMessage);
			last_user_message = current_input; // Store for retry
			current_input = '';

			is_streaming = true;
			final_answer_started = false;
			generation_error = null; // Clear previous errors

			try {
				for await (const chunk of streamAnswer(
					langGraphClient,
					threadId,
					assistantId,
					userMessage.text,
					userMessage.id
				))
					updateMessages(chunk);
			} catch (err) {
				if (err instanceof Error) generation_error = err;
			} finally {
				is_streaming = false;
			}
		}
	}

	function retryGeneration() {
		if (last_user_message) {
			current_input = last_user_message;
			inputSubmit();
		}
	}
</script>

{#if !chat_started}
	<ChatSuggestions
		{suggestions}
		{introTitle}
		{intro}
		onSuggestionClick={(suggestedText) => (current_input = suggestedText)}
	/>
{:else}
	<ChatMessages
		{messages}
		finalAnswerStarted={final_answer_started}
		{generation_error}
		onRetryError={retryGeneration}
	/>
{/if}
<ChatInput bind:value={current_input} isStreaming={is_streaming} onSubmit={inputSubmit} />
