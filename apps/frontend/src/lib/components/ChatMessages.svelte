<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message, BaseMessage } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import type { Attachment } from 'svelte/attachments';
	import { fly } from 'svelte/transition';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
	}

	let { messages, finalAnswerStarted }: Props = $props();

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

<div class="mx-auto w-full max-w-4xl px-4 py-8">
	{#each messages as message (message.id)}
		<div {@attach scrollToMe(message)} transition:fly={{ y: 20, duration: 800 }}>
			{#if message.type === 'tool'}
				<ChatToolMessage {message} />
			{:else if message.text}
				<ChatMessage {message} />
			{/if}
		</div>
	{/each}
	{#if !finalAnswerStarted}
		<ChatWaiting />
	{/if}
</div>
