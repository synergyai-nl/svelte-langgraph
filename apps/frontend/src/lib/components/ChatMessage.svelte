<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { UserOutline } from 'flowbite-svelte-icons';
	import LoadingIndicator from './LoadingIndicator.svelte';
	import type { BaseMessage } from '$lib/types/messageTypes';

	interface Props {
		message: BaseMessage;
		isLastMessage?: boolean;
		scrollToMe: (node: HTMLElement) => { destroy: () => void };
	}

	let { message, isLastMessage = false, scrollToMe }: Props = $props();

	let isWaiting = $derived(message.type === 'ai' && isLastMessage && !message.text);
</script>

<div
	class="mb-6 w-full {message.type === 'user' ? 'flex justify-end' : 'flex justify-start'}"
	use:scrollToMe
>
	<div
		class="flex items-start gap-3 {message.type === 'user'
			? 'max-w-[70%] flex-row-reverse'
			: 'max-w-[80%]'}"
	>
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<UserOutline size="sm" class="text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			{#if isWaiting}
				<LoadingIndicator />
			{/if}
			<Card
				class="w-full max-w-none p-4 text-sm shadow-sm {message.type === 'user'
					? 'pulse-subtle border-0 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
					: 'border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}"
			>
				<p
					class="whitespace-pre-wrap leading-relaxed {message.type === 'user'
						? ''
						: 'text-gray-900 dark:text-gray-100'}"
				>
					{message.text}
				</p>
			</Card>
		</div>
	</div>
</div>

<style>
	@keyframes pulse-subtle {
		0%,
		100% {
			box-shadow: 0 0 0 rgba(0, 0, 0, 0.1);
		}
		50% {
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		}
	}

	.pulse-subtle {
		animation: pulse-subtle 2s ease-in-out infinite;
	}
</style>
