<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import { fly } from 'svelte/transition';
	import { ScrollableContainer } from './ScrollableContainer';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
		onEdit: (message: Message, newText: string) => boolean;
		onRegenerate: (message: Message) => void;
	}

	let {
		messages = [],
		finalAnswerStarted,
		generationError = null,
		onRetryError,
		onEdit,
		onRegenerate
	}: Props = $props();
</script>

<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		{#each messages as message (message.id)}
			<div {@attach scrollToMe(message)} transition:fly={{ y: 20, duration: 800 }}>
				{#if message.type === 'tool'}
					<ChatToolMessage {message} />
				{:else if message.text || (message.type === 'ai' && message.thinking)}
					<ChatMessage {message} {onEdit} {onRegenerate} />
				{/if}
			</div>
		{/each}
		<div {@attach scrollToMe()} transition:fly={{ y: 20, duration: 800 }}>
			{#if generationError && onRetryError}
				<ChatErrorMessage error={generationError} onRetry={onRetryError} />
			{:else if !finalAnswerStarted}
				<ChatWaiting />
			{/if}
		</div>
	{/snippet}
</ScrollableContainer>
