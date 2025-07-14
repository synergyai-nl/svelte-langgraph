<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { UserOutline } from 'flowbite-svelte-icons';
	import LoadingIndicator from './LoadingIndicator.svelte';

	interface BaseMessage {
		type: 'ai' | 'user';
		text: string;
	}

	interface Props {
		message: BaseMessage;
		isStreaming?: boolean;
		isLastMessage?: boolean;
		scrollToMe: (node: HTMLElement) => { destroy: () => void };
	}

	let { message, isStreaming = false, isLastMessage = false, scrollToMe }: Props = $props();
</script>

<style>
	@keyframes pulse-subtle {
		0%, 100% { box-shadow: 0 0 0 rgba(0, 0, 0, 0.1); }
		50% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
	}

	.pulse-subtle {
		animation: pulse-subtle 2s ease-in-out infinite;
	}
</style>

<div class="mb-6 w-full {message.type === 'user' ? 'flex justify-end' : 'flex justify-start'}" use:scrollToMe>
	<div class="flex items-start gap-3 {message.type === 'user' ? 'max-w-[70%] flex-row-reverse' : 'max-w-[80%]'}">
		<div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 dark:bg-gray-400 flex items-center justify-center">
			<UserOutline size="sm" class="text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			{#if message.type === 'ai' && isStreaming && isLastMessage}
				<LoadingIndicator />
			{/if}
			<Card class="p-4 text-sm shadow-sm w-full max-w-none {message.type === 'user' 
				? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-0 pulse-subtle' 
				: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}">
				<p class="whitespace-pre-wrap leading-relaxed">{message.text}</p>
			</Card>
		</div>
	</div>
</div>