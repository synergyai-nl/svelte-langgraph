<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import { fly } from 'svelte/transition';
	import { VirtualList } from 'flowbite-svelte';
	import { ScrollableContainer } from './ScrollableContainer';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
	}

	let { messages = [], finalAnswerStarted, generationError = null, onRetryError }: Props = $props();
</script>

<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		<div class="h-full">
			<VirtualList items={messages} contained minItemHeight={100} let:item>
				<div class="mx-auto w-full max-w-4xl px-4 py-1">
					<div {@attach scrollToMe(item)} transition:fly={{ y: 20, duration: 800 }}>
						{#if item.type === 'tool'}
							<ChatToolMessage message={item} />
						{:else if item.text}
							<ChatMessage message={item} />
						{/if}
					</div>
				</div>
			</VirtualList>

			<div {@attach scrollToMe()} transition:fly={{ y: 20, duration: 800 }}>
				{#if generationError && onRetryError}
					<ChatErrorMessage error={generationError} onRetry={onRetryError} />
				{:else if !finalAnswerStarted}
					<ChatWaiting />
				{/if}
			</div>
		</div>
	{/snippet}
</ScrollableContainer>
