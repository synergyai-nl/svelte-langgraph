import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChatWithThreadListHost from './__tests__/ChatWithThreadListHost.svelte';
import type { Client } from '@langchain/langgraph-sdk';
import * as mockModule from './__tests__/mockUseStream.svelte';

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Provide assistants.getSchemas so createStateSync degrades gracefully (returns null schema)
const mockClient = {
	assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) }
} as unknown as Client;

function renderChat({
	loadingReporter
}: { loadingReporter?: (threadId: string, loading: boolean) => void } = {}) {
	const refresh = vi.fn();
	return render(ChatWithThreadListHost, {
		props: {
			refresh,
			loadingReporter: loadingReporter && { setLoading: loadingReporter },
			chatProps: {
				langGraphClient: mockClient,
				assistantId: 'assistant-1',
				threadId: 'test-123'
			}
		}
	});
}

beforeEach(() => {
	mockModule.resetMock();
});

describe('Chat history-loading skeleton', () => {
	test('shows the skeleton while the thread history is loading', async () => {
		mockModule.setIsThreadLoading(true);

		renderChat();
		await tick();

		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
	});

	test('hides the skeleton once history loading finishes', async () => {
		mockModule.setIsThreadLoading(true);

		renderChat();
		await tick();
		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();

		mockModule.setIsThreadLoading(false);
		await tick();

		expect(screen.queryByTestId('chat-history-loading')).not.toBeInTheDocument();
	});

	test('suppresses the suggestions screen while loading, even with no messages', async () => {
		mockModule.setIsThreadLoading(true);

		renderChat();
		await tick();

		expect(screen.queryByRole('heading')).not.toBeInTheDocument();
		expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
	});

	test('suppresses the messages list while loading, even with non-empty messages', async () => {
		mockModule.setMessages([
			{ type: 'human', content: 'Previous question', id: 'msg-1' },
			{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
		]);
		mockModule.setIsThreadLoading(true);

		renderChat();
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

		renderChat();
		await tick();
		expect(screen.queryByText('Previous answer')).not.toBeInTheDocument();

		mockModule.setIsThreadLoading(false);
		await tick();

		await waitFor(() => {
			expect(screen.getByText('Previous answer')).toBeInTheDocument();
		});
	});

	test('reports loading state to the thread-loading reporter as the mock flips', async () => {
		const setLoading = vi.fn();
		mockModule.setIsThreadLoading(true);

		renderChat({ loadingReporter: setLoading });
		await tick();

		expect(setLoading).toHaveBeenCalledWith('test-123', true);

		mockModule.setIsThreadLoading(false);
		await tick();

		expect(setLoading).toHaveBeenCalledWith('test-123', false);
		expect(setLoading.mock.calls.at(-1)).toEqual(['test-123', false]);
	});

	test('reports loading false on unmount', async () => {
		const setLoading = vi.fn();
		mockModule.setIsThreadLoading(true);

		const { unmount } = renderChat({ loadingReporter: setLoading });
		await tick();
		expect(setLoading).toHaveBeenCalledWith('test-123', true);

		unmount();

		expect(setLoading).toHaveBeenLastCalledWith('test-123', false);
	});
});
