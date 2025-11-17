<script lang="ts">
	import { createScrollListener } from '$lib/components/ScrollableContainer/scrollListener';
	import { findScrollContainer, scrollToBottom } from './scrollControls';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { BaseMessage } from '$lib/langgraph/types';

	interface Props {
		children: Snippet<[{ scrollToMe: (message?: BaseMessage | null) => Attachment }]>;
	}

	let { children }: Props = $props();

	let isUserScrolledAway = $state(false);
	let scrollContainerRef: HTMLElement | null = null;

	const scrollListenerAction = createScrollListener({
		setIsUserScrolledAway: (value: boolean) => {
			isUserScrolledAway = value;
		},
		setScrollContainer: (container: HTMLElement | null) => {
			scrollContainerRef = container;
		}
	});

	function scrollToMe(message: BaseMessage | null = null): Attachment {
		return (element: HTMLElement) => {
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

<div class="mx-auto w-full max-w-4xl px-4 py-8" use:scrollListenerAction>
	{@render children({ scrollToMe })}
</div>
