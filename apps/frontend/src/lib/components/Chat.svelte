<script lang="ts">
	import { Client } from '@langchain/langgraph-sdk';
	import { streamAnswer } from '../utils/streamAnswer.js';
	import ChatMessage from './ChatMessage.svelte';
	import ToolMessage from './ToolMessage.svelte';
	import ChatInput from './ChatInput.svelte';
	import SuggestionCard from './SuggestionCard.svelte';
	import type { Message, BaseMessage, ToolMessageType, ChatSuggestion } from '$lib/types/messageTypes';

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		threadId: string;
		userName?: string;
		chatStarted: boolean;
		onChatStart: () => void;
		suggestions?: ChatSuggestion[];
	}

	// Default suggestions as constants, outside the component.
	const defaultSuggestions: ChatSuggestion[] = [
		{
			title: "Creative Brainstorming",
			description: "Generate ideas for projects, writing, or problem-solving",
			suggestedText: "Help me brainstorm ideas for a creative project"
		},
		{
			title: "Writing Assistance",
			description: "Draft, edit, or improve emails, documents, and more",
			suggestedText: "Help me write and improve some text"
		},
		{
			title: "Learn Something New",
			description: "Get clear explanations on topics you're curious about",
			suggestedText: "Explain a complex topic in simple terms"
		},
		{
			title: "Problem Solving",
			description: "Break down challenges and find solutions together",
			suggestedText: "Help me analyze and solve a problem"
		}
	];


	let { 
		langGraphClient, 
		assistantId, 
		threadId, 
		userName, 
		chatStarted, 
		onChatStart, 
		suggestions = defaultSuggestions
	}: Props = $props();

	let current_input = $state('');
	let is_streaming = $state(false);
	let messages = $state<Array<Message>>([{ type: 'ai', text: 'How can I help you?' }]);

	async function inputSubmit() {
		if (current_input) {
			if (!chatStarted) {
				onChatStart();
			}
			
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

			for await (const chunk of streamAnswer(langGraphClient, threadId, assistantId, current_input)) {
				console.log('Processing chunk in inputSubmit:', chunk);
				if (chunk.type === 'tool') {
					const toolMsg: ToolMessageType = {
						type: 'tool',
						text: "I'm using tools...",
						tool_name: chunk.tool_name,
						payload: chunk.tool_payload,
						collapsed: true,
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

	function getGreeting() {
		if (userName) {
			return `Hey ${userName}, how can I help you today?`;
		} else {
			return 'How can I help you today?';
		}
	}
</script>

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

{#if !chatStarted}
	<div class="min-h-screen flex flex-col items-center justify-start pt-16">
		<div class="w-full max-w-4xl mx-auto">
			<div class="flex flex-col items-center justify-center text-center">
				<div class="max-w-2xl mx-auto space-y-8 fade-slide-up">
					<div class="space-y-4">
						<h1 class="text-4xl md:text-5xl font-light text-gray-900 dark:text-white">
							{getGreeting()}
						</h1>
						<p class="text-lg text-gray-600 dark:text-gray-400 font-light">
							I'm here to assist with your questions, provide information, help with tasks, or engage in conversation.
						</p>
					</div>
					
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
						{#each suggestions as suggestion}
							<SuggestionCard
								title={suggestion.title}
								description={suggestion.description}
								suggestedText={suggestion.suggestedText}
								onclick={() => current_input = suggestion.suggestedText}
							/>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
	
	<ChatInput
		bind:value={current_input}
		isStreaming={is_streaming}
		onSubmit={inputSubmit}
	/>
{:else}
	<div class="h-screen flex flex-col">
		<div class="flex-1 overflow-y-auto pb-32">
			<div class="w-full max-w-4xl mx-auto px-4 py-8">
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

		<ChatInput
			bind:value={current_input}
			isStreaming={is_streaming}
			onSubmit={inputSubmit}
		/>
	</div>
{/if}
