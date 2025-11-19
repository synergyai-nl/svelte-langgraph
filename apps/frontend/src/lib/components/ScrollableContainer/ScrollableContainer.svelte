<script lang="ts">
	import { createScrollListener } from '$lib/components/ScrollableContainer/scrollListener';
	import { findScrollContainer, scrollToBottom } from './scrollControls';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { BaseMessage } from '$lib/langgraph/types';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		children: Snippet<[{ scrollToMe: (message?: BaseMessage | null) => Attachment }]>;
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

	// Scroll to bottom on mount without animation
	onMount(() => {
		if (containerNode) {
			const container = findScrollContainer(containerNode);
			if (container) {
				// Use instant scroll on initial mount
				container.scrollTop = container.scrollHeight;
			}
		}
	});

	function scrollToMe(message: BaseMessage | null = null): Attachment {
		return (element: Element) => {
			if (!(element instanceof HTMLElement)) return;
			if (message && !message.text) return;

			const container = findScrollContainer(element);
			if (!container) return;

			if (!scrollContainerRef) {
				scrollContainerRef = container;
			}

			if (!isUserScrolledAway) {
				scrollToBottom(container);
			}
		};
	}
</script>

<div class="mx-auto w-full max-w-4xl px-4 py-8" use:scrollListenerAction bind:this={containerNode} in:fade={{ duration: 400, delay: 0 }}>
	{@render children({ scrollToMe })}
</div>
