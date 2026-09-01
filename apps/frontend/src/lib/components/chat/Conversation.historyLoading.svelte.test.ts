import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import LangGraphHost from './__tests__/LangGraphHost.svelte';
import Conversation from './Conversation.svelte';
import { makeContext, makeMockClient } from './__tests__/testContext.js';
import * as mockModule from '../__tests__/mockUseStream.svelte';

/**
 * Ported from the deleted `Chat.historyLoading.svelte.test.ts` (git history at `906acf6`) onto
 * `Conversation`. The old suite spied on a `setThreadLoadingReporter` context; `Conversation`
 * instead calls `ctx?.setThreadLoading(threadId, loading)` directly on the real
 * `LangGraphContext`, so `ctx.setThreadLoading` is spied on here instead — assertions unchanged.
 */

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('../__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

function renderConversation() {
	const client = makeMockClient();
	const ctx = makeContext({ client, assistantId: 'assistant-1' });
	const setThreadLoading = vi.spyOn(ctx, 'setThreadLoading');
	const result = render(LangGraphHost, {
		props: { ctx, component: Conversation, threadId: 'test-123' }
	});
	return { ...result, setThreadLoading };
}

beforeEach(() => {
	mockModule.resetMock();
});

describe('Conversation history-loading skeleton', () => {
	test('shows the skeleton while the thread history is loading', async () => {
		mockModule.setIsThreadLoading(true);

		renderConversation();
		await tick();

		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
	});

	test('hides the skeleton once history loading finishes', async () => {
		mockModule.setIsThreadLoading(true);

		renderConversation();
		await tick();
		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();

		mockModule.setIsThreadLoading(false);
		await tick();

		expect(screen.queryByTestId('chat-history-loading')).not.toBeInTheDocument();
	});

	test('suppresses the messages list while loading, even with non-empty messages', async () => {
		mockModule.setMessages([
			{ type: 'human', content: 'Previous question', id: 'msg-1' },
			{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
		]);
		mockModule.setIsThreadLoading(true);

		renderConversation();
		await tick();

		expect(screen.queryByText('Previous answer')).not.toBeInTheDocument();
		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
	});

	test('reveals the messages once loading finishes', async () => {
		mockModule.setMessages([
			{ type: 'human', content: 'Previous question', id: 'msg-1' },
			{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
		]);
		mockModule.setIsThreadLoading(true);

		renderConversation();
		await tick();
		expect(screen.queryByText('Previous answer')).not.toBeInTheDocument();

		mockModule.setIsThreadLoading(false);
		await tick();

		await waitFor(() => {
			expect(screen.getByText('Previous answer')).toBeInTheDocument();
		});
	});

	test('reports loading state to the context as the mock flips', async () => {
		mockModule.setIsThreadLoading(true);

		const { setThreadLoading } = renderConversation();
		await tick();

		expect(setThreadLoading).toHaveBeenCalledWith('test-123', true);

		mockModule.setIsThreadLoading(false);
		await tick();

		expect(setThreadLoading).toHaveBeenCalledWith('test-123', false);
		expect(setThreadLoading.mock.calls.at(-1)).toEqual(['test-123', false]);
	});

	test('reports loading false on unmount', async () => {
		mockModule.setIsThreadLoading(true);

		const { setThreadLoading, unmount } = renderConversation();
		await tick();
		expect(setThreadLoading).toHaveBeenCalledWith('test-123', true);

		unmount();

		expect(setThreadLoading).toHaveBeenLastCalledWith('test-123', false);
	});
});
