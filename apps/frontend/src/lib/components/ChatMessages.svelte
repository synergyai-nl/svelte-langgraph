<script lang="ts">
	import ChatMessage from './ChatMessage.svelte';
	import ChatToolMessage from './ChatToolMessage.svelte';
	import type { Message, BaseMessage } from '$lib/langgraph/types';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatErrorMessage from './ChatErrorMessage.svelte';
	import type { Attachment } from 'svelte/attachments';
	import { fly } from 'svelte/transition';
	import { createScrollListener } from '$lib/utils/scrollListener';
	import { findScrollContainer, scrollToBottom } from '$lib/utils/scrollControls';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
	}

	let { messages, finalAnswerStarted, generationError = null, onRetryError }: Props = $props();

	let isUserScrolledAway = $state(false);
	let scrollContainerRef: HTMLElement | null = null;

	const scrollListenerAction = createScrollListener(
		{
			setIsUserScrolledAway: (value: boolean) => {
				isUserScrolledAway = value;
			},
			setScrollContainer: (container: HTMLElement | null) => {
				scrollContainerRef = container;
			}
		},
		(atBottom) => {
			//TODO - Only for debugging, remove before PR merge.
			console.info('Scroll intent debounce callback, atBottom:', atBottom);
		}
	);

	function scrollToMe(message: BaseMessage | null = null): Attachment {
		return (element) => {
			if (message && !message.text) return;

			const container = findScrollContainer(element as HTMLElement);
			if (!container) return;

			// Store reference to scroll container if not already set
			if (!scrollContainerRef) {
				scrollContainerRef = container;
			}

			// Only auto-scroll if user hasn't scrolled away
			if (!isUserScrolledAway) {
				scrollToBottom(container);
			}
		};
	}
</script>

<div class="mx-auto w-full max-w-4xl px-4 py-8" use:scrollListenerAction>
	{#each messages as message (message.id)}
		<div {@attach scrollToMe(message)} transition:fly={{ y: 20, duration: 800 }}>
			{#if message.type === 'tool'}
				<ChatToolMessage {message} />
			{:else if message.text}
				<ChatMessage {message} />
			{/if}
		</div>
	{/each}
	{#if generationError && onRetryError}
		<div {@attach scrollToMe()} transition:fly={{ y: 20, duration: 800 }}>
			<ChatErrorMessage error={generationError} onRetry={onRetryError} />
		</div>
	{:else if !finalAnswerStarted}
		<div {@attach scrollToMe()} transition:fly={{ y: 20, duration: 800 }}>
			<ChatWaiting />
		</div>
	{/if}
</div>
