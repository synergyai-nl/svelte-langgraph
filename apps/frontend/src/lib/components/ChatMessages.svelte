<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message, BaseMessage } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generation_error?: Error | null;
		onRetryError?: () => void;
	}

	let { messages, finalAnswerStarted, generation_error = null, onRetryError }: Props = $props();

	function scrollToMe(message: BaseMessage): Attachment {
		return (element) => {
			if (message.text) {
				element.scrollIntoView({ behavior: 'smooth', block: 'end' });
			}
		};
	}
</script>

<div class="flex h-screen flex-col">
	<div class="flex-1 overflow-y-auto pb-32">
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
			{#if generation_error && onRetryError}
				<ChatErrorMessage error={generation_error} onRetry={onRetryError} />
			{:else if !finalAnswerStarted}
				<ChatWaiting />
			{/if}
		</div>
	</div>
</div>
