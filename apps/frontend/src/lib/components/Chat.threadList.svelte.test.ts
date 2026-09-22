import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChatWithThreadListHost from './__tests__/ChatWithThreadListHost.svelte';
import type { TitleClient } from '$lib/langgraph/threadTitle';
import * as mockModule from './__tests__/mockUseStream.svelte';

// Chat's feedback path posts straight to Aegra, reading the backend URL from
// `$env/dynamic/public` — a SvelteKit global that only exists at runtime.
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_LANGGRAPH_API_URL: 'https://backend.test' }
}));

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Standalone consts, not reached through `mockClient.threads.*`, so `.mockResolvedValueOnce(...)`
// isn't type-checked against the real SDK types (`mockClient` is cast `as unknown as TitleClient`).
const threadsGetMock = vi.fn().mockResolvedValue({ metadata: {} });
const threadsUpdateMock = vi.fn().mockResolvedValue({});
const generateTitleMock = vi.fn().mockResolvedValue({ title: 'Generated Title' });
const mockClient = {
	assistants: {
		getSchemas: vi.fn().mockResolvedValue({ state_schema: null })
	},
	threads: {
		get: threadsGetMock,
		update: threadsUpdateMock
	},
	generateTitle: generateTitleMock
} as unknown as TitleClient;

function renderChatWithRefresh() {
	const refresh = vi.fn();
	render(ChatWithThreadListHost, {
		props: {
			refresh,
			chatProps: {
				langGraphClient: mockClient,
				accessToken: 'test-token',
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
	generateTitleMock.mockReset().mockResolvedValue({ title: 'Generated Title' });
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
	test('unmount aborts the title request and prevents a late metadata write', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });
		let resolveTitle!: (value: { title: string }) => void;
		generateTitleMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveTitle = resolve;
				})
		);
		mockModule.setMessages(openingExchange);
		const refresh = vi.fn();
		const { unmount } = render(ChatWithThreadListHost, {
			props: {
				refresh,
				chatProps: {
					langGraphClient: mockClient,
					accessToken: 'test-token',
					assistantId: 'assistant-1',
					threadId: 'test-123'
				}
			}
		});
		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledOnce());
		const signal = generateTitleMock.mock.calls[0][1] as AbortSignal;
		unmount();
		expect(signal.aborted).toBe(true);
		resolveTitle({ title: 'Late Title' });
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});

	test('settle triggers a title request and metadata PATCH, then refreshes again once titled', async () => {
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

		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(1));
		expect(generateTitleMock).toHaveBeenCalledWith(
			openingExchange.map(({ type, content }) => ({ type, content })),
			expect.any(AbortSignal)
		);
		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Generated Title' }
			})
		);
		// A second refresh fires once the awaited title request actually lands.
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	});

	test('an existing metadata title (a user rename) is left alone — no request, no PATCH', async () => {
		threadsGetMock.mockResolvedValue({ metadata: { title: 'Renamed by the user' } });

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();

		// Not an exact count: restoring stored ratings reads the same thread on
		// mount, so the number of gets belongs to neither feature alone. What
		// matters here is that titling asked for nothing and wrote nothing.
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalled());
		await tick();
		expect(generateTitleMock).not.toHaveBeenCalled();
		expect(threadsUpdateMock).not.toHaveBeenCalled();
		// The settle's ordinary refresh still fires — only titling is skipped.
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('a rename landing while the title request is in flight is not overwritten', async () => {
		// Untitled at the pre-run check; renamed by the time the pre-PATCH re-check
		// runs. Twice, not once: restoring stored ratings reads the same thread on
		// mount, and that read must not be the one that sees the rename.
		threadsGetMock
			.mockResolvedValueOnce({ metadata: {} })
			.mockResolvedValueOnce({ metadata: {} })
			.mockResolvedValue({ metadata: { title: 'Renamed mid-run' } });

		renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(1));
		// Three: the ratings restore on mount, then titling's own two checks.
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(3));
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a failed title request is retried on the next settle', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });
		generateTitleMock.mockRejectedValueOnce(new Error('model blip'));

		renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setMessages(openingExchange);
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(1));
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// A second settle (e.g. a follow-up message) retries rather than staying stuck.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(2));
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

		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Generated Title' }
			})
		);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('single-flight: a settle that lands while a title request is already in flight starts no second run', async () => {
		threadsGetMock.mockResolvedValue({ metadata: {} });
		let resolveWait!: (value: { title: string }) => void;
		generateTitleMock.mockImplementationOnce(
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
		await waitFor(() => expect(generateTitleMock).toHaveBeenCalledTimes(1));

		// A second settle fires while the first title request is still unresolved.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();
		await tick();

		expect(generateTitleMock).toHaveBeenCalledTimes(1);

		resolveWait({ title: 'Generated Title' });
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
	});
});
