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
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		getRating?: (message: Message) => 'up' | 'down' | null;
	}

	let {
		messages = [],
		finalAnswerStarted,
		isStreaming = false,
		generationError = null,
		onRetryError,
		onEdit,
		onRegenerate,
		onFeedback,
		getRating
	}: Props = $props();

	// The message currently being generated is always the last one in the list — while a
	// run is streaming, only that message's thinking pill should show the "still working"
	// animation. Once the stream finishes (or on reload, when isStreaming is always false),
	// this is undefined and no message animates.
	let streamingMessageId = $derived(
		isStreaming && messages.length > 0 ? messages[messages.length - 1].id : undefined
	);

	// Mounting hundreds of historical messages in one synchronous flush (each markdown-parsed)
	// freezes the tab, so on first mount only the newest WINDOW_CHUNK_SIZE render synchronously;
	// the rest reveal in chunks over successive frames.
	const WINDOW_CHUNK_SIZE = 40;
	// Capturing the mount-time length is the point: it separates backlog from new messages.
	// svelte-ignore state_referenced_locally
	const initialCount = messages.length;
	let revealFrom = $state(initialCount > WINDOW_CHUNK_SIZE ? initialCount - WINDOW_CHUNK_SIZE : 0);
	let visibleMessages = $derived(messages.slice(Math.min(revealFrom, messages.length)));

	// Reveal policy: rAF auto-drain. Planned infinite scrolling will swap ONLY this trigger for
	// a scroll-up one — keep it isolated; do not couple to scroll position.
	$effect(() => {
		if (revealFrom === 0) return;
		let raf = requestAnimationFrame(function step() {
			revealFrom = Math.max(0, revealFrom - WINDOW_CHUNK_SIZE);
			if (revealFrom > 0) raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});

	// Branch switch (edit/regenerate) can shrink messages mid-expansion.
	$effect(() => {
		if (messages.length < initialCount && revealFrom > 0) revealFrom = 0;
	});

	function isBacklog(globalIndex: number) {
		return globalIndex < initialCount;
	}
</script>

<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		{#each visibleMessages as message, i (message.id)}
			{@const backlog = isBacklog(revealFrom + i)}
			<div
				{@attach scrollToMe(message, backlog ? 'instant' : 'smooth')}
				transition:fly={{ y: 20, duration: backlog ? 0 : 800 }}
			>
				{#if message.type === 'tool'}
					<ChatToolMessage {message} />
				{:else if message.text || (message.type === 'ai' && message.thinking)}
					<ChatMessage
						{message}
						{onEdit}
						{onRegenerate}
						{onFeedback}
						{getRating}
						isThinkingActive={message.type === 'ai' && message.id === streamingMessageId}
					/>
				{/if}
			</div>
		{/each}
		<div
			{@attach scrollToMe(undefined, revealFrom === 0 ? 'smooth' : 'instant')}
			transition:fly={{ y: 20, duration: revealFrom === 0 ? 800 : 0 }}
		>
			{#if generationError && onRetryError}
				<ChatErrorMessage error={generationError} onRetry={onRetryError} />
			{:else if !finalAnswerStarted}
				<ChatWaiting />
			{/if}
		</div>
	{/snippet}
</ScrollableContainer>
