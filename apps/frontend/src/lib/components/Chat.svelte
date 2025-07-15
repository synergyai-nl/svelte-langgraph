<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '../utils/streamAnswer.js';
	import ChatMessage from './ChatMessage.svelte';
	import ToolMessage from './ToolMessage.svelte';
	import ChatInput from './ChatInput.svelte';
	import SuggestionCard from './SuggestionCard.svelte';
	import type {
		Message,
		BaseMessage,
		ToolMessageType,
		ChatSuggestion
	} from '$lib/types/messageTypes';

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
				text: current_input
			});

			is_streaming = true;

			let aimessage: Message = {
				type: 'ai',
				text: ''
			};

			messages.push(aimessage);

			for await (const chunk of streamAnswer(
				langGraphClient,
				threadId,
				assistantId,
				current_input
			)) {
				console.log('Processing chunk in inputSubmit:', chunk);
				if (chunk.type === 'tool') {
					const toolMsg: ToolMessageType = {
						type: 'tool',
						text: "I'm using tools...",
						tool_name: chunk.tool_name,
						payload: chunk.tool_payload,
						collapsed: true
					};
					messages.push(toolMsg);

					aimessage = {
						type: 'ai',
						text: ''
					};
					messages.push(aimessage);
					messages = [...messages];
				} else if (chunk.type === 'text') {
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

	function scrollToMe(node: HTMLElement) {
		node.scrollIntoView({ behavior: 'smooth', block: 'center' });
		return {
			destroy() {}
		};
	}
</script>

{#if !chat_started}
	<div class="flex min-h-screen flex-col items-center justify-start pt-16">
		<div class="mx-auto w-full max-w-4xl">
			<div class="flex flex-col items-center justify-center text-center">
				<div class="fade-slide-up mx-auto max-w-2xl space-y-8">
					<div class="space-y-4">
						<h1 class="text-4xl font-light text-gray-900 md:text-5xl dark:text-white">
							{introTitle}
						</h1>
						<p class="text-lg font-light text-gray-600 dark:text-gray-400">
							{intro}
						</p>
					</div>

					<div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each suggestions as suggestion}
							<SuggestionCard
								title={suggestion.title}
								description={suggestion.description}
								suggestedText={suggestion.suggestedText}
								onclick={() => (current_input = suggestion.suggestedText)}
							/>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="flex h-screen flex-col">
		<div class="flex-1 overflow-y-auto pb-32">
			<div class="mx-auto w-full max-w-4xl px-4 py-8">
				{#each messages as message, index}
					{#if !(index === 0 && message.text === 'How can I help you?')}
						{#if message.type === 'tool'}
							<ToolMessage message={message as ToolMessageType} {scrollToMe} />
						{:else}
							<ChatMessage
								message={message as BaseMessage}
								isStreaming={is_streaming}
								isLastMessage={index === messages.length - 1}
								{scrollToMe}
							/>
						{/if}
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}
<ChatInput bind:value={current_input} isStreaming={is_streaming} onSubmit={inputSubmit} />

<style>
	@keyframes fade-slide-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.fade-slide-up {
		animation: fade-slide-up 0.6s ease-out;
	}
</style>
