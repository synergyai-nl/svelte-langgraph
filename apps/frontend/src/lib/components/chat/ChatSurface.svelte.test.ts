import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import LangGraphHost from './__tests__/LangGraphHost.svelte';
import ChatSurface from './ChatSurface.svelte';
import { makeContext, makeMockClient } from './__tests__/testContext.js';
import type { ChatSuggestion } from './Suggestions.svelte';
import * as mockModule from '../__tests__/mockUseStream.svelte';
import { useStream } from '@langchain/svelte';

// Mock useStream — same idiom as the old Chat suites: Conversation (mounted inside ChatSurface)
// depends on it directly.
vi.mock('@langchain/svelte', async () => {
	const mod = await import('../__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

const suggestions: ChatSuggestion[] = [
	{ title: 'Suggestion 1', description: 'Desc 1', suggestedText: 'Tell me about AI' },
	{ title: 'Suggestion 2', description: 'Desc 2', suggestedText: 'Help me code' }
];

function renderChatSurface(overrides: Record<string, unknown> = {}) {
	const client = makeMockClient();
	const ctx = makeContext({ client, assistantId: 'assistant-1' });
	return {
		ctx,
		...render(LangGraphHost, {
			props: {
				ctx,
				component: ChatSurface,
				threadId: 'test-123',
				suggestions,
				introTitle: 'Welcome',
				intro: 'How can I help?',
				...overrides
			}
		})
	};
}

beforeEach(() => {
	mockModule.resetMock();
});

describe('ChatSurface', () => {
	describe('default composition', () => {
		test('displays the suggestions view for an empty thread', () => {
			renderChatSurface();
			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		test('displays the composer', () => {
			renderChatSurface();
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
		});

		test('clicking a suggestion switches from suggestions to messages view', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);
			});
			renderChatSurface();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		test('clicking a suggestion submits its suggestedText', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			renderChatSurface();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(mockSubmit).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: [expect.objectContaining({ type: 'human', content: 'Tell me about AI' })]
					})
				);
			});
		});

		test('submitting a typed message switches from suggestions to messages view', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([
					{ type: 'human', content: 'Hello', id: 'user-1' },
					{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
				]);
			});
			renderChatSurface();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
				expect(screen.getByText('Hello')).toBeInTheDocument();
			});
		});

		test('renders messages instead of suggestions when the thread already has messages', () => {
			mockModule.setMessages([
				{ type: 'human', content: 'Previous question', id: 'msg-1' },
				{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
			]);
			renderChatSurface();

			expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			expect(screen.getByText('Previous answer')).toBeInTheDocument();
		});

		test('shows the history-loading skeleton instead of suggestions while history loads', () => {
			mockModule.setIsThreadLoading(true);
			renderChatSurface();

			expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
		});
	});

	describe('threadId resolution', () => {
		test('shows the ChatLoader when there is no threadId prop and no active thread in context', () => {
			renderChatSurface({ threadId: undefined });
			expect(screen.queryByPlaceholderText('Ask your agent…')).not.toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
		});

		test('falls back to the ambient context activeThreadId when no threadId prop is given', () => {
			const client = makeMockClient();
			const ctx = makeContext({ client, assistantId: 'assistant-1' });
			ctx.setActiveThreadIdProp('ctx-thread-1', undefined);
			render(LangGraphHost, {
				props: {
					ctx,
					component: ChatSurface,
					threadId: undefined,
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?'
				}
			});

			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
		});
	});

	describe('{#key} remount on threadId change', () => {
		test('remounts Conversation (re-initializes useStream) when threadId changes', async () => {
			const streamMock = vi.mocked(useStream);
			const { rerender } = renderChatSurface({ threadId: 'thread-a' });
			const callsAfterFirstMount = streamMock.mock.calls.length;
			expect(callsAfterFirstMount).toBeGreaterThan(0);

			await rerender({ threadId: 'thread-b' });

			expect(streamMock.mock.calls.length).toBeGreaterThan(callsAfterFirstMount);
		});

		test('does not remount when re-rendered with the same threadId', async () => {
			const streamMock = vi.mocked(useStream);
			const { rerender } = renderChatSurface({ threadId: 'thread-a' });
			const callsAfterFirstMount = streamMock.mock.calls.length;

			await rerender({ threadId: 'thread-a' });

			expect(streamMock.mock.calls.length).toBe(callsAfterFirstMount);
		});
	});

	describe('sidebar prop', () => {
		test('renders no ThreadList when sidebar is not given', () => {
			renderChatSurface();
			expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
		});

		test('renders a ThreadList beside the conversation pane when sidebar is true', () => {
			renderChatSurface({ sidebar: true });
			expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
		});

		test('the rendered ThreadList reflects the ambient context thread list', () => {
			const client = makeMockClient();
			const ctx = makeContext({ client, assistantId: 'assistant-1' });
			render(LangGraphHost, {
				props: {
					ctx,
					component: ChatSurface,
					threadId: 'test-123',
					sidebar: true,
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?'
				}
			});

			// Empty (never-fetched) thread list from a fresh LangGraphContext.
			expect(screen.getByText('No conversations yet')).toBeInTheDocument();
		});
	});
});
