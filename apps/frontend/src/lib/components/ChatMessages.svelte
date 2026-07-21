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
		/** Whether a run is currently streaming in — used to animate the thinking pill of the in-flight message. */
		isStreaming?: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
		onEdit: (message: Message, newText: string) => boolean;
		onRegenerate: (message: Message) => void;
	}

	let {
		messages = [],
		finalAnswerStarted,
		isStreaming = false,
		generationError = null,
		onRetryError,
		onEdit,
		onRegenerate
	}: Props = $props();

	// The message currently being generated is always the last one in the list — while a
	// run is streaming, only that message's thinking pill should show the "still working"
	// animation. Once the stream finishes (or on reload, when isStreaming is always false),
	// this is undefined and no message animates.
	let streamingMessageId = $derived(
		isStreaming && messages.length > 0 ? messages[messages.length - 1].id : undefined
	);
</script>

<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		{#each messages as message (message.id)}
			<div {@attach scrollToMe(message)} transition:fly={{ y: 20, duration: 800 }}>
				{#if message.type === 'tool'}
					<ChatToolMessage {message} />
				{:else if message.text || (message.type === 'ai' && message.thinking)}
					<ChatMessage
						{message}
						{onEdit}
						{onRegenerate}
						isThinkingActive={message.type === 'ai' && message.id === streamingMessageId}
					/>
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
