<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { BaseMessage, ToolMessage } from '@langchain/core/messages';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import { fly } from 'svelte/transition';
	import { ScrollableContainer } from './ScrollableContainer';

	interface Props {
		messages: BaseMessage[];
		isLoading?: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
		onEditSave?: (messageId: string, newText: string) => void;
	}

	let {
		messages = [],
		isLoading = false,
		generationError = null,
		onRetryError,
		onEditSave
	}: Props = $props();

	function getContent(message: BaseMessage): string {
		return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
	}
</script>

<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		{#each messages as message (message.id ?? message.content)}
			<div {@attach scrollToMe(message)} transition:fly={{ y: 20, duration: 800 }}>
				{#if message.getType() === 'tool'}
					<ChatToolMessage message={message as ToolMessage} />
				{:else if getContent(message)}
					<ChatMessage {message} {onEditSave} {isLoading} />
				{/if}
			</div>
		{/each}
		<div {@attach scrollToMe()} transition:fly={{ y: 20, duration: 800 }}>
			{#if generationError && onRetryError}
				<ChatErrorMessage error={generationError} onRetry={onRetryError} />
			{:else if isLoading}
				<ChatWaiting />
			{/if}
		</div>
	{/snippet}
</ScrollableContainer>
