<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message, BaseMessage } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import type { Attachment } from 'svelte/attachments';
	import { fly } from 'svelte/transition';
	import { VirtualList } from 'flowbite-svelte';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
	}

	let { messages = [], finalAnswerStarted, generationError = null, onRetryError }: Props = $props();

	function scrollToMe(message: BaseMessage): Attachment {
		return (element) => {
			if (message.text) {
				// Find the scrollable parent container
				const scrollContainer = element.closest('.overflow-y-auto');
				if (scrollContainer) {
					// Smooth scroll the container to bottom
					// The container already has bottom padding to account for the fixed input
					scrollContainer.scrollTo({
						top: scrollContainer.scrollHeight,
						behavior: 'smooth'
					});
				}
			}
		};
	}
</script>

<div class="h-[600px] overflow-hidden">
	<VirtualList items={messages} contained minItemHeight={100} height={600}>
		{#snippet children(item: Message)}
			<div class="mx-auto w-full max-w-4xl px-4 py-1">
				<div {@attach scrollToMe(item)} transition:fly={{ y: 20, duration: 800 }}>
					{#if item.type === 'tool'}
						<ChatToolMessage message={item} />
					{:else if item.text}
						<ChatMessage message={item} />
					{/if}
				</div>
			</div>
		{/snippet}
	</VirtualList>

	{#if generationError && onRetryError}
		<ChatErrorMessage error={generationError} onRetry={onRetryError} />
	{:else if !finalAnswerStarted}
		<ChatWaiting />
	{/if}
</div>
