import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import ChatWrapper from './__tests__/ChatWrapper.svelte';
import type { Client, Thread } from '@langchain/langgraph-sdk';
import type { ThreadValues, Message } from '$lib/langgraph/types';
import type { ChatSuggestion } from './ChatSuggestions.svelte';

// Mock streamAnswer — this is the key dependency
vi.mock('$lib/langgraph/streamAnswer.js', () => ({
	streamAnswer: vi.fn()
}));

vi.mock('$lib/langgraph/utils.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/langgraph/utils.js')>();
	return {
		...actual,
		convertThreadMessages: vi.fn().mockReturnValue([])
	};
});

// Import after mocking
const { streamAnswer } = await import('$lib/langgraph/streamAnswer.js');
const { convertThreadMessages } = await import('$lib/langgraph/utils.js');

const mockClient = {} as Client;
const emptyThread: Thread<ThreadValues> = {
	thread_id: 'test-123',
	created_at: '2024-01-01',
	updated_at: '2024-01-01',
	metadata: {},
	status: 'idle',
	values: { messages: [] },
	interrupts: {}
};

const suggestions: ChatSuggestion[] = [
	{ title: 'Suggestion 1', description: 'Desc 1', suggestedText: 'Tell me about AI' },
	{ title: 'Suggestion 2', description: 'Desc 2', suggestedText: 'Help me code' }
];

function renderChat(overrides: Record<string, unknown> = {}) {
	return render(ChatWrapper, {
		props: {
			langGraphClient: mockClient,
			assistantId: 'assistant-1',
			thread: emptyThread,
			suggestions,
			introTitle: 'Welcome',
			intro: 'How can I help?',
			...overrides
		}
	});
}

/** Helper to create a streamAnswer mock that yields messages */
function mockStreamYield(...messages: Message[]) {
	vi.mocked(streamAnswer).mockImplementation(async function* () {
		for (const msg of messages) {
			yield msg;
		}
	});
}

describe('Chat', () => {
	describe('when rendered with empty thread', () => {
		it('should display suggestions view', () => {
			mockStreamYield();
			renderChat();

			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		it('should display chat input', () => {
			mockStreamYield();
			renderChat();

			expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument();
		});
	});

	describe('when a suggestion is clicked', () => {
		it('should switch from suggestions to messages view', async () => {
			const user = userEvent.setup();
			mockStreamYield({ type: 'ai', text: 'AI response', id: 'ai-1' });
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		it('should call streamAnswer with correct args', async () => {
			const user = userEvent.setup();
			mockStreamYield({ type: 'ai', text: 'Response', id: 'ai-1' });
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(streamAnswer).toHaveBeenCalledWith(
					mockClient,
					'test-123',
					'assistant-1',
					'Tell me about AI',
					expect.any(String)
				);
			});
		});
	});

	describe('when a message is submitted', () => {
		it('should switch to messages view', async () => {
			const user = userEvent.setup();
			mockStreamYield({ type: 'ai', text: 'Hello!', id: 'ai-1' });
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		it('should display the user message', async () => {
			const user = userEvent.setup();
			mockStreamYield({ type: 'ai', text: 'Hi there!', id: 'ai-1' });
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.getByText('Hello')).toBeInTheDocument();
			});
		});

		it('should display the AI response after streaming', async () => {
			const user = userEvent.setup();
			mockStreamYield({ type: 'ai', text: 'Hi there!', id: 'ai-1' });
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.getByText('Hi there!')).toBeInTheDocument();
			});
		});
	});

	describe('when rendered with existing thread messages', () => {
		it('should display messages view immediately', async () => {
			const existingMessages = [
				{ type: 'human', content: 'Previous question', id: 'msg-1' },
				{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
			];

			vi.mocked(convertThreadMessages).mockReturnValue([
				{ type: 'user', text: 'Previous question', id: 'msg-1' },
				{ type: 'ai', text: 'Previous answer', id: 'msg-2' }
			]);

			mockStreamYield();

			const threadWithMessages: Thread<ThreadValues> = {
				...emptyThread,
				values: { messages: existingMessages }
			};

			renderChat({ thread: threadWithMessages });

			await waitFor(() => {
				// Should show messages view, not suggestions
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
				expect(screen.getByText('Previous answer')).toBeInTheDocument();
			});
		});
	});
});
