import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChatWithThreadListHost from './__tests__/ChatWithThreadListHost.svelte';
import type { Client } from '@langchain/langgraph-sdk';
import * as mockModule from './__tests__/mockUseStream.svelte';

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Chat.svelte imports `$lib/langgraph/client` (for the SLG-117 title assistant lookup), which
// reads `$env/dynamic/public` at module scope — a SvelteKit global that only exists at runtime.
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// Standalone consts, not reached through `mockClient.threads.*`, so `.mockResolvedValueOnce(...)`
// isn't type-checked against the real SDK types (`mockClient` is cast `as unknown as Client`).
const threadsGetMock = vi.fn().mockResolvedValue({ metadata: {} });
const threadsUpdateMock = vi.fn().mockResolvedValue({});
const runsWaitMock = vi.fn().mockResolvedValue({ title: 'Generated Title' });
// One existing assistant, so `getOrCreateAssistant(client, 'title')` resolves without needing
// `assistants.create`.
const assistantsSearchMock = vi.fn().mockResolvedValue([{ assistant_id: 'title-assistant-1' }]);

const mockClient = {
	assistants: {
		getSchemas: vi.fn().mockResolvedValue({ state_schema: null }),
		search: assistantsSearchMock
	},
	threads: {
		get: threadsGetMock,
		update: threadsUpdateMock
	},
	runs: {
		wait: runsWaitMock
	}
} as unknown as Client;

function renderChatWithRefresh() {
	const refresh = vi.fn();
	render(ChatWithThreadListHost, {
		props: {
			refresh,
			chatProps: {
				langGraphClient: mockClient,
				assistantId: 'assistant-1',
				threadId: 'test-123'
			}
		}
	});
	return refresh;
}

beforeEach(() => {
	mockModule.resetMock();
	// Default to an already-titled thread, so `ensureThreadTitle` is a no-op unless a test opts
	// into an untitled thread explicitly.
	threadsGetMock.mockReset().mockResolvedValue({ metadata: { title: 'Existing Title' } });
	threadsUpdateMock.mockReset().mockResolvedValue({});
	runsWaitMock.mockReset().mockResolvedValue({ title: 'Generated Title' });
	assistantsSearchMock.mockReset().mockResolvedValue([{ assistant_id: 'title-assistant-1' }]);
});

const openingExchange = [
	{ type: 'human', content: 'Hello', id: 'user-1' },
	{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
];

describe('Chat thread-list refresh notification', () => {
	test('does not refresh on an empty settled mount', async () => {
		const refresh = renderChatWithRefresh();

		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('does not refresh while a run is still streaming', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();

		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('refreshes exactly once when a run settles with messages', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('does not refresh again when nothing changed', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();
		expect(refresh).toHaveBeenCalledTimes(1);

		// Same thread, same message count — a re-render must not re-notify.
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('does not refresh when history hydrates after mount without a run ever loading', async () => {
		// isLoading stays false throughout — this simulates an existing thread's history fetch
		// resolving asynchronously after mount, not a run settling.
		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('refreshes on a same-length message replacement (regenerate)', async () => {
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		// Regenerate replaces the AI message in place — same length, different content.
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'A different answer!', id: 'ai-2' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('refreshes on every settle within the same mount, not just the first', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();
		expect(refresh).toHaveBeenCalledTimes(1);

		// A second run starts and settles in the same mount — must refresh again.
		mockModule.setIsLoading(true);
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' },
			{ type: 'human', content: 'Another message', id: 'user-2' },
			{ type: 'ai', content: 'Another reply', id: 'ai-2' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(2);
	});
});

describe('Frontend-driven thread titling (SLG-117)', () => {
	test('settle triggers a title run and metadata PATCH, then refreshes again once titled', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();

		// The settle's own refresh (unrelated to titling) fires immediately.
		expect(refresh).toHaveBeenCalledTimes(1);

		await waitFor(() => expect(runsWaitMock).toHaveBeenCalledTimes(1));
		expect(runsWaitMock).toHaveBeenCalledWith(null, 'title-assistant-1', {
			input: { messages: openingExchange }
		});
		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Generated Title' }
			})
		);
		// A second refresh fires once the awaited title run actually lands.
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	});

	test('an existing metadata title (a user rename) is left alone — no run, no PATCH', async () => {
		threadsGetMock.mockResolvedValue({ metadata: { title: 'Renamed by the user' } });

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await tick();
		expect(runsWaitMock).not.toHaveBeenCalled();
		expect(threadsUpdateMock).not.toHaveBeenCalled();
		// The settle's ordinary refresh still fires — only titling is skipped.
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('a failed title run is retried on the next settle', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });
		runsWaitMock.mockRejectedValueOnce(new Error('model blip'));

		renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(runsWaitMock).toHaveBeenCalledTimes(1));
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// A second settle (e.g. a follow-up message) retries rather than staying stuck.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(runsWaitMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
	});

	test('mount backfill titles a pre-existing untitled thread once history has loaded', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });

		mockModule.setIsThreadLoading(true);
		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setMessages(openingExchange);
		mockModule.setIsThreadLoading(false);
		await tick();

		await waitFor(() => expect(runsWaitMock).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Generated Title' }
			})
		);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('single-flight: a settle that lands while a title run is already in flight starts no second run', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });
		let resolveWait!: (value: { title: string }) => void;
		runsWaitMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveWait = resolve;
				})
		);

		renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(runsWaitMock).toHaveBeenCalledTimes(1));

		// A second settle fires while the first title run is still unresolved.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();
		await tick();

		expect(runsWaitMock).toHaveBeenCalledTimes(1);

		resolveWait({ title: 'Generated Title' });
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
	});
});
