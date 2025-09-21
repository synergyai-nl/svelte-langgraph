<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '../utils/streamAnswer.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions from './ChatSuggestions.svelte';
	import type { Message, ToolMessageType, ChatSuggestion } from '$lib/types/messageTypes';
	import { Toast } from 'flowbite-svelte';
	import { CloseCircleSolid } from 'flowbite-svelte-icons';

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		threadId: string;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	interface ApiError extends Error {
		status?: number;
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
	let messages = $state<Array<Message>>([]);
	let chat_started = $state(false);
	let showErrorToast = $state(false);
	let toastMessage = $state('');

	async function inputSubmit() {
		if (current_input) {
			chat_started = true;

			messages.push({
				type: 'user',
				text: current_input,
				id: crypto.randomUUID()
			});

			is_streaming = true;

			let aimessage: Message = {
				type: 'ai',
				text: '',
				id: ''
			};

			messages.push(aimessage);

			const userMessage = messages[messages.length - 2]; // Get the user message we just added
			try {
				for await (const chunk of streamAnswer(
					langGraphClient,
					threadId,
					assistantId,
					current_input,
					userMessage.id
				)) {
					console.log('Processing chunk in inputSubmit:', chunk);
					if (chunk.type === 'tool') {
						const toolMsg: ToolMessageType = {
							type: 'tool',
							text: "I'm using tools...",
							tool_name: chunk.tool_name,
							payload: chunk.tool_payload,
							collapsed: true,
							id: `${chunk.messageId || crypto.randomUUID()}-${chunk.tool_name}-${crypto.randomUUID().slice(0, 8)}`
						};
						messages.push(toolMsg);

						aimessage = {
							type: 'ai',
							text: '',
							id: ''
						};
						messages.push(aimessage);
						messages = [...messages];
					} else if (chunk.type === 'text') {
						if (!aimessage.id) {
							aimessage.id = chunk.messageId || crypto.randomUUID();
						}
						aimessage.text += chunk.text;

						let aiMessageIndex = -1;
						for (let i = messages.length - 1; i >= 0; i--) {
							if (messages[i].type === 'ai') {
								aiMessageIndex = i;
								break;
							}
						}

						if (aiMessageIndex !== -1) {
							messages[aiMessageIndex] = { ...aimessage };
							messages = [...messages];
						}
					}
				}
			} catch (error: unknown) {
				console.error('Streaming error:', error);
				const err = error as ApiError;
				const status = err.status ?? 500; //Fallback to 500

				let userMessage = 'Something went wrong. Please try again.';

				switch (status) {
					case 400:
						userMessage = 'Invalid request. Please try again.';
						break;
					case 401:
					case 403:
						userMessage = 'You are not authorized to perform this action.';
						break;
					case 404:
						userMessage = 'Resource not found.';
						break;
					case 429:
						userMessage = 'Too many requests. Please wait a moment and try again.';
						break;
					case 500:
					case 502:
					case 503:
						userMessage = 'Server error. Please try again later.';
						break;
				}

				toastMessage = userMessage;
				showErrorToast = true;
			} finally {
				current_input = '';
				is_streaming = false;
			}

			current_input = '';
			is_streaming = false;
		}
	}
</script>

<div class="relative h-full w-full">
	{#if !chat_started}
		<ChatSuggestions
			{suggestions}
			{introTitle}
			{intro}
			onSuggestionClick={(suggestedText) => (current_input = suggestedText)}
		/>
	{:else}
		<ChatMessages {messages} />
	{/if}

	{#if showErrorToast}
		<Toast color="red" position="top-right" onclose={() => (showErrorToast = false)}>
			{#snippet icon()}
				<CloseCircleSolid class="h-5 w-5" />
				<span class="sr-only">Error icon</span>
			{/snippet}
			{toastMessage}
		</Toast>
	{/if}
</div>

<ChatInput bind:value={current_input} isStreaming={is_streaming} onSubmit={inputSubmit} />
