<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message, BaseMessage } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
	}

	let { messages, finalAnswerStarted }: Props = $props();

	function scrollToMe(message: BaseMessage): Attachment {
		return (element) => {
			if (message.text) {
				element.scrollIntoView({ behavior: 'smooth', block: 'end' });
			}
		};
	}
</script>

<div class="mx-auto w-full max-w-4xl px-4 py-8">
	{#each messages as message (message.id)}
		<div {@attach scrollToMe(message)}>
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
