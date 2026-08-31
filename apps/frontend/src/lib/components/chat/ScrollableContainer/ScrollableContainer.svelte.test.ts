import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ScrollableContainerHost from './__tests__/ScrollableContainerHost.svelte';
import { anAIMessage } from '../../__tests__/fixtures';
import type { Message } from '@svelte-langgraph/client';

/**
 * Renders message rows through ScrollableContainer's `scrollToMe` attachment,
 * mirroring how ChatMessages.svelte wires `{@attach scrollToMe(message)}`.
 *
 * The mount target is given the `overflow-y-auto` class that `findScrollContainer`
 * looks for, matching the real scroll container in Chat.svelte.
 */
function renderMessageRows(messages: Message[]) {
	const target = document.createElement('div');
	target.className = 'overflow-y-auto';
	document.body.appendChild(target);

	const rendered = render(ScrollableContainerHost, { target, props: { messages } });
	return { target, ...rendered };
}

function renderMessageRow(message: Message) {
	return renderMessageRows([message]);
}

describe('ScrollableContainer', () => {
	let scrollToSpy: ReturnType<typeof vi.spyOn>;
	let rafCallbacks: FrameRequestCallback[];

	/**
	 * The coalesced scroll (createBottomScroller in scrollControls.ts) defers its
	 * `scrollTo` call to a `requestAnimationFrame`. Stubbing it with a manual queue lets
	 * tests deterministically control when a "frame" resolves instead of racing jsdom's
	 * real frame timing.
	 */
	function flushRaf() {
		const pending = rafCallbacks.splice(0, rafCallbacks.length);
		pending.forEach((cb) => cb(0));
	}

	beforeEach(() => {
		scrollToSpy = vi.spyOn(Element.prototype, 'scrollTo');
		rafCallbacks = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		});
	});

	afterEach(() => {
		scrollToSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	// Scrolling is now coalesced onto a requestAnimationFrame (see createBottomScroller),
	// so every case below flushes the stubbed frame before asserting on scrollTo.

	test('scrolls to an AI message that has thinking but no text yet', () => {
		renderMessageRow(anAIMessage({ text: '', thinking: 'Let me think...', id: 'ai-thinking' }));

		flushRaf();

		expect(scrollToSpy).toHaveBeenCalled();
	});

	test('scrolls to a message that already has text', () => {
		renderMessageRow(anAIMessage({ id: 'ai-1' }));

		flushRaf();

		expect(scrollToSpy).toHaveBeenCalled();
	});

	test('does not scroll for a message with neither text nor thinking', async () => {
		// Mount unconditionally requests an instant scroll on its own (independent of any
		// row's content), so isolate the row's contribution by flushing that away first, then
		// swapping in the empty row on its own frame (a differently-keyed row, so only the new
		// row's attachment runs — the old row is torn down, not re-attached).
		const { rerender } = renderMessageRow(anAIMessage({ id: 'ai-1' }));
		flushRaf();
		scrollToSpy.mockClear();

		await rerender({ messages: [anAIMessage({ text: '', id: 'ai-empty' })] });
		flushRaf();

		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	test('collapses a bulk mount of many rows into a single scrollTo call per frame', () => {
		const messages = Array.from({ length: 20 }, (_, index) => anAIMessage({ id: `ai-${index}` }));

		renderMessageRows(messages);

		// Nothing fires synchronously — every row's request is batched onto the next frame.
		expect(scrollToSpy).not.toHaveBeenCalled();

		flushRaf();

		expect(scrollToSpy).toHaveBeenCalledTimes(1);
	});

	test('scrolls instantly on mount', () => {
		renderMessageRow(anAIMessage({ id: 'ai-1' }));

		flushRaf();

		// The mount-time request and the row's own request coalesce into the same frame;
		// 'instant' wins so the initial scroll never animates.
		expect(scrollToSpy).toHaveBeenCalledTimes(1);
		expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
	});

	test('suppresses the scroll for rows mounted after the user has scrolled away', async () => {
		const { target, rerender } = renderMessageRows([anAIMessage({ id: 'ai-1' })]);
		flushRaf();
		scrollToSpy.mockClear();

		// A wheel event marks the user as scrolled away (see scrollListener.ts).
		target.dispatchEvent(new Event('wheel'));

		await rerender({ messages: [anAIMessage({ id: 'ai-1' }), anAIMessage({ id: 'ai-2' })] });
		flushRaf();

		expect(scrollToSpy).not.toHaveBeenCalled();
	});
});
