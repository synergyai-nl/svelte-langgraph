<script lang="ts">
	import { createScrollListener } from '$lib/components/ScrollableContainer/scrollListener';
	import { findScrollContainer, createBottomScroller } from './scrollControls';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { BaseMessage } from '$lib/langgraph/types';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		children: Snippet<
			[{ scrollToMe: (message?: BaseMessage | null, behavior?: ScrollBehavior) => Attachment }]
		>;
	}

	let { children }: Props = $props();

	let isUserScrolledAway = $state(false);
	let scrollContainerRef: HTMLElement | null = null;
	let containerNode: HTMLElement | null = null;

	const scrollListenerAction = createScrollListener({
		setIsUserScrolledAway: (value: boolean) => {
			isUserScrolledAway = value;
		},
		setScrollContainer: (container: HTMLElement | null) => {
			scrollContainerRef = container;
		}
	});

	const bottomScroller = createBottomScroller(() => scrollContainerRef);

	// Scroll to bottom on mount without animation
	onMount(() => {
		if (containerNode) {
			if (!scrollContainerRef) {
				scrollContainerRef = findScrollContainer(containerNode);
			}
			// Use instant scroll on initial mount
			bottomScroller.request('instant');
		}
	});

	function scrollToMe(
		message: BaseMessage | null = null,
		behavior: ScrollBehavior = 'smooth'
	): Attachment {
		return (element: Element) => {
			if (!(element instanceof HTMLElement)) return;
			const isThinkingAIMessage =
				message?.type === 'ai' && 'thinking' in message && !!message.thinking;
			if (message && !message.text && !isThinkingAIMessage) return;

			const container = findScrollContainer(element);
			if (!container) return;

			if (!scrollContainerRef) {
				scrollContainerRef = container;
			}

			if (!isUserScrolledAway) {
				bottomScroller.request(behavior);
			}
		};
	}
</script>

<div
	class="mx-auto w-full max-w-4xl px-4 py-8"
	use:scrollListenerAction
	bind:this={containerNode}
	in:fade={{ duration: 400, delay: 0 }}
>
	{@render children({ scrollToMe })}
</div>
