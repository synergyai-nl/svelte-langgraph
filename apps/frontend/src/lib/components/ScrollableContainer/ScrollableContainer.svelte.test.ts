import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ScrollableContainerHost from './__tests__/ScrollableContainerHost.svelte';
import { anAIMessage } from '../__tests__/fixtures';
import type { Message } from '$lib/langgraph/types';

/**
 * Renders a single message row through ScrollableContainer's `scrollToMe` attachment,
 * mirroring how ChatMessages.svelte wires `{@attach scrollToMe(message)}`.
 *
 * The mount target is given the `overflow-y-auto` class that `findScrollContainer`
 * looks for, matching the real scroll container in Chat.svelte.
 */
function renderMessageRow(message: Message | null) {
	const target = document.createElement('div');
	target.className = 'overflow-y-auto';
	document.body.appendChild(target);

	render(ScrollableContainerHost, { target, props: { message } });
}

describe('ScrollableContainer', () => {
	let scrollToSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		scrollToSpy = vi.spyOn(Element.prototype, 'scrollTo');
	});

	afterEach(() => {
		scrollToSpy.mockRestore();
	});

	test('scrolls to an AI message that has thinking but no text yet', () => {
		renderMessageRow(anAIMessage({ text: '', thinking: 'Let me think...', id: 'ai-thinking' }));

		expect(scrollToSpy).toHaveBeenCalled();
	});

	test('scrolls to a message that already has text', () => {
		renderMessageRow(anAIMessage({ id: 'ai-1' }));

		expect(scrollToSpy).toHaveBeenCalled();
	});

	test('does not scroll for a message with neither text nor thinking', () => {
		renderMessageRow(anAIMessage({ text: '', id: 'ai-empty' }));

		expect(scrollToSpy).not.toHaveBeenCalled();
	});
});
