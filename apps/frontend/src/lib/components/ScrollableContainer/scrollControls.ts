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
export function scrollToBottom(container: HTMLElement): void {
	container.scrollTo({
		top: container.scrollHeight,
		behavior: SCROLL_CONTROLS.SCROLL_BEHAVIOR
	});
}

/**
 * Find the scrollable parent container
 */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
	return element.closest('.overflow-y-auto') as HTMLElement | null;
}
