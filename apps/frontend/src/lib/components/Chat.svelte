<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '$lib/langgraph/streamAnswer.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions, { type ChatSuggestion } from './ChatSuggestions.svelte';
	import type { Message, UserMessage } from '$lib/langgraph/types';
	import { error } from '@sveltejs/kit';

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
	let generationError = $state<Error | null>(null);
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

	async function submitInputOrRetry(isRetry = false) {
		if (current_input) {
			chat_started = true;

			let messageText: string;
			let messageId: string;

			if (!isRetry) {
				// New message: create and push to messages array
				const userMessage: UserMessage = {
					type: 'user',
					text: current_input,
					id: crypto.randomUUID()
				};
				messages.push(userMessage);
				last_user_message = current_input; // Store for retry
				messageText = userMessage.text;
				messageId = userMessage.id;
			} else {
				// Retry: reuse existing message
				const lastUserMsg = messages.findLast((m) => m.type === 'user');
				if (!lastUserMsg || !lastUserMsg.text || !lastUserMsg.id) {
					error(500, {
						message: 'Retry attempted but no or invalid user message found'
					});
				}
				messageText = lastUserMsg.text;
				messageId = lastUserMsg.id;
			}

			current_input = '';

			is_streaming = true;
			final_answer_started = false;
			generationError = null; // Clear previous errors

			try {
				for await (const chunk of streamAnswer(
					langGraphClient,
					threadId,
					assistantId,
					messageText,
					messageId
				))
					updateMessages(chunk);
			} catch (err) {
				if (err instanceof Error) generationError = err;
				error(500, {
					message: 'Error during generation'
				});
			} finally {
				is_streaming = false;
			}
		}
	}

	function retryGeneration() {
		if (last_user_message) {
			current_input = last_user_message;
			submitInputOrRetry(true);
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
				onSuggestionClick={(suggestedText) => {
					current_input = suggestedText;
					submitInputOrRetry();
				}}
			/>
		{:else}
			<ChatMessages
				{messages}
				finalAnswerStarted={final_answer_started}
				{generationError}
				onRetryError={retryGeneration}
			/>
		{/if}
	</div>
	<ChatInput bind:value={current_input} isStreaming={is_streaming} onSubmit={submitInputOrRetry} />
</div>
