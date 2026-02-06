import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// required for svelte5 + jsdom as jsdom does not support matchMedia
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	enumerable: true,
	value: vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

// jsdom does not support element.animate (used by Svelte transitions)
if (typeof Element.prototype.animate === 'undefined') {
	Element.prototype.animate = function () {
		return {
			onfinish: null,
			cancel: () => {},
			finish: () => {},
			pause: () => {},
			play: () => {},
			reverse: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
			currentTime: 0,
			playbackRate: 1,
			playState: 'finished' as AnimationPlayState,
			finished: Promise.resolve({} as Animation),
			pending: false,
			ready: Promise.resolve({} as Animation),
			startTime: null,
			timeline: null,
			effect: null,
			id: '',
			replaceState: 'active' as AnimationReplaceState,
			oncancel: null,
			onremove: null,
			persist: () => {},
			commitStyles: () => {},
			updatePlaybackRate: () => {}
		} as unknown as Animation;
	};
}

// jsdom does not support scrollTo
Element.prototype.scrollTo = function () {};
window.scrollTo = function () {} as typeof window.scrollTo;

// add more mocks here if you need them
