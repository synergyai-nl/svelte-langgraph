<script lang="ts">
	import { createScrollListener } from '$lib/utils/scrollListener';
	import { findScrollContainer, scrollToBottom } from '$lib/utils/scrollControls';
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';
	import type { BaseMessage } from '$lib/langgraph/types';

	interface Props {
		children: Snippet<[{ scrollToMe: (message?: BaseMessage | null) => Action<HTMLElement> }]>;
	}

	let { children }: Props = $props();

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
			console.info('Scroll intent debounce callback, atBottom:', atBottom);
		}
	);

	function scrollToMe(message: BaseMessage | null = null): Action<HTMLElement> {
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
