import { SCROLL_CONTROLS, isScrollKey, isAtBottom, findScrollContainer } from './scrollControls';
import type { Action } from 'svelte/action';

/**
 * Creates a scroll listener action that detects user scroll intent
 * and manages auto-scroll behavior for chat messages
 */
export function createScrollListener(
	stateUpdater: {
		setIsUserScrolledAway: (value: boolean) => void;
		setScrollContainer: (container: HTMLElement | null) => void;
	},
	onScrollIntentDetected?: (isAtBottom: boolean) => void
): Action<HTMLElement> {
	return (node: HTMLElement) => {
		let scrollContainer: HTMLElement | null = null;
		let userScrollTimeout: number | null = null;

		// Detect ANY user scroll interaction (wheel, touch, keyboard)
		const handleUserScrollIntent = (event: Event) => {
			console.info('User scroll intent detected:', event.type);
			stateUpdater.setIsUserScrolledAway(true);

			// Clear any existing timeout
			if (userScrollTimeout) {
				clearTimeout(userScrollTimeout);
			}

			// After user stops scrolling, check if they're at bottom
			userScrollTimeout = window.setTimeout(() => {
				if (scrollContainer) {
					const atBottom = isAtBottom(scrollContainer);
					if (atBottom) {
						stateUpdater.setIsUserScrolledAway(false);
						console.info('User returned to bottom, re-enabling auto-scroll');
					} else {
						console.info('User still scrolled away');
					}
					onScrollIntentDetected?.(atBottom);
				}
			}, SCROLL_CONTROLS.DEBOUNCE_MS);
		};

		const handleKeyScroll = (e: Event) => {
			const keyEvent = e as KeyboardEvent;
			if (isScrollKey(keyEvent.key)) {
				handleUserScrollIntent(e);
			}
		};

		// Attach scroll listener
		scrollContainer = findScrollContainer(node);

		if (scrollContainer) {
			console.info('Attach scroll listener to container:', scrollContainer);
			stateUpdater.setScrollContainer(scrollContainer);

			// Listen to multiple scroll-related events to catch user intent early
			scrollContainer.addEventListener('wheel', handleUserScrollIntent, { passive: true });
			scrollContainer.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
			scrollContainer.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
			scrollContainer.addEventListener('keydown', handleKeyScroll);
		} else {
			console.warn('No scroll container found!');
		}

		return {
			destroy() {
				if (scrollContainer) {
					scrollContainer.removeEventListener('wheel', handleUserScrollIntent);
					scrollContainer.removeEventListener('touchstart', handleUserScrollIntent);
					scrollContainer.removeEventListener('touchmove', handleUserScrollIntent);
					scrollContainer.removeEventListener('keydown', handleKeyScroll);
				}
				if (userScrollTimeout) {
					clearTimeout(userScrollTimeout);
				}
			}
		};
	};
}
