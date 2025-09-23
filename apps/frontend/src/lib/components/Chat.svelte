<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '../utils/streamAnswer.js';
	import ChatInput from './ChatInput.svelte';
	import ChatMessages from './ChatMessages.svelte';
	import ChatSuggestions from './ChatSuggestions.svelte';
	import type { Message, ToolMessageType, ChatSuggestion } from '$lib/types/messageTypes';
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

	let current_input = $state('');
	let is_streaming = $state(false);
	let messages = $state<Array<Message>>([]);
	let chat_started = $state(false);

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
						text: m.tools_using(),
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

			current_input = '';
			is_streaming = false;
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
	<ChatMessages {messages} isStreaming={is_streaming} />
{/if}
<ChatInput bind:value={current_input} isStreaming={is_streaming} onSubmit={inputSubmit} />
