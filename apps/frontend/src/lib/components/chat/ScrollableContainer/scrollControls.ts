/**
 * Centralized scroll control configuration and utilities
 */

export const SCROLL_CONTROLS = {
	/** Pixels from bottom to consider container "at bottom" */
	THRESHOLD: 100,
	/** Debounce time (ms) for scroll intent detection */
	DEBOUNCE_MS: 500,
	/** Keys that trigger scroll intent */
	SCROLL_KEYS: ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '],
	/** Scroll animation behavior */
	SCROLL_BEHAVIOR: 'smooth' as const
};

/**
 * Check if scroll container is at the bottom
 */
export function isAtBottom(container: HTMLElement): boolean {
	const { scrollTop, scrollHeight, clientHeight } = container;
	return scrollHeight - scrollTop - clientHeight < SCROLL_CONTROLS.THRESHOLD;
}

/**
 * Check if a key triggers scroll intent
 */
export function isScrollKey(key: string): boolean {
	return SCROLL_CONTROLS.SCROLL_KEYS.includes(key);
}

/**
 * Scroll container to bottom smoothly
 */
export function scrollToBottom(
	container: HTMLElement,
	behavior: ScrollBehavior = SCROLL_CONTROLS.SCROLL_BEHAVIOR
): void {
	container.scrollTo({
		top: container.scrollHeight,
		behavior
	});
}

/**
 * Find the scrollable parent container
 */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
	return element.closest('.overflow-y-auto') as HTMLElement | null;
}

/**
 * Coalesces bursts of scroll-to-bottom requests into at most one `scrollTo`
 * call per animation frame.
 *
 * Bulk-mounting many message rows each schedules its own scroll request; without
 * coalescing, every mount would force a synchronous `scrollHeight` layout read and
 * fire a `scrollTo({ behavior: 'smooth' })` call that the next row's request
 * immediately supersedes, thrashing layout for no visible benefit. Instead we
 * batch all requests within a frame and resolve the container and behavior once,
 * right before the browser paints.
 */
export function createBottomScroller(getContainer: () => HTMLElement | null) {
	let scheduled = false;
	let pendingBehavior: ScrollBehavior = 'smooth';

	function request(behavior: ScrollBehavior = 'smooth') {
		// 'instant' in a batch wins — don't stack a smooth animation onto content still
		// being bulk-inserted
		pendingBehavior =
			pendingBehavior === 'instant' || behavior === 'instant' ? 'instant' : behavior;

		if (scheduled) return;
		scheduled = true;

		requestAnimationFrame(() => {
			scheduled = false;
			const behaviorToUse = pendingBehavior;
			pendingBehavior = 'smooth';

			const container = getContainer();
			if (!container) return;

			container.scrollTo({ top: container.scrollHeight, behavior: behaviorToUse });
		});
	}

	return { request };
}
