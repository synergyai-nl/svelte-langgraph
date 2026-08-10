import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import Chat from './Chat.svelte';
import type { Client } from '@langchain/langgraph-sdk';
import type { ChatSuggestion } from './ChatSuggestions.svelte';
import * as mockModule from './__tests__/mockUseStream.svelte';
import * as m from '$lib/paraglide/messages.js';

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Provide assistants.getSchemas so createStateSync degrades gracefully (returns null schema)
const mockClient = {
	assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) }
} as unknown as Client;

const suggestions: ChatSuggestion[] = [
	{ title: 'Suggestion 1', description: 'Desc 1', suggestedText: 'Tell me about AI' },
	{ title: 'Suggestion 2', description: 'Desc 2', suggestedText: 'Help me code' }
];

function renderChat(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(Chat, {
		langGraphClient: mockClient,
		assistantId: 'assistant-1',
		threadId: 'test-123',
		suggestions,
		introTitle: 'Welcome',
		intro: 'How can I help?',
		...overrides
	});
}

beforeEach(() => {
	mockModule.resetMock();
});

describe('Chat', () => {
	describe('when rendered with empty thread', () => {
		test('displays suggestions view', () => {
			renderChat();
			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		test('displays chat input', () => {
			renderChat();
			expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument();
		});
	});

	describe('when a suggestion is clicked', () => {
		test('switches from suggestions to messages view', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);
			});
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		test('calls stream.submit with correct args', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(mockSubmit).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: [
							expect.objectContaining({
								type: 'human',
								content: 'Tell me about AI'
							})
						]
					})
				);
			});
		});
	});

	describe('when a message is submitted', () => {
		test('switches to messages view', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([{ type: 'ai', content: 'Hello!', id: 'ai-1' }]);
			});
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		test('displays the user message', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([
					{ type: 'human', content: 'Hello', id: 'user-1' },
					{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
				]);
			});
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.getByText('Hello')).toBeInTheDocument();
			});
		});

		test('displays the AI response after streaming', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([
					{ type: 'human', content: 'Hello', id: 'user-1' },
					{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
				]);
			});
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.getByText('Hi there!')).toBeInTheDocument();
			});
		});
	});

	describe('when a message includes thinking/reasoning', () => {
		test('displays the thinking pill for a reasoning-only message', async () => {
			mockModule.setMessages([
				{
					type: 'ai',
					content: '',
					additional_kwargs: { reasoning_content: 'Let me reason about this...' },
					id: 'ai-thinking-1'
				}
			]);

			renderChat();

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
			});
		});

		test('displays both the thinking pill and the text for a message with both', async () => {
			mockModule.setMessages([
				{
					type: 'ai',
					content: 'The answer is 42',
					additional_kwargs: { reasoning_content: 'Let me reason about this...' },
					id: 'ai-thinking-2'
				}
			]);

			renderChat();

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
				expect(screen.getByText('The answer is 42')).toBeInTheDocument();
			});
		});
	});

	describe('when stop is clicked', () => {
		test('stop button calls stream.stop', async () => {
			const user = userEvent.setup();
			const mockStop = vi.fn(() => mockModule.setIsLoading(false));
			mockModule.mockStreamCallbacks.stop = mockStop;
			mockModule.mockStreamCallbacks.submit = vi.fn(() => mockModule.setIsLoading(true));

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			const form = document.getElementById('input_form')!;
			const stopButton = await within(form).findByRole('button');
			await user.click(stopButton);

			expect(mockStop).toHaveBeenCalled();
		});

		test('stopping stream shows no error', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => mockModule.setIsLoading(true));
			mockModule.mockStreamCallbacks.stop = vi.fn(() => mockModule.setIsLoading(false));

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());

			await user.click(within(document.getElementById('input_form')!).getByRole('button'));

			await waitFor(() => {
				expect(screen.queryByRole('alert')).not.toBeInTheDocument();
				expect(screen.getByRole('textbox')).not.toBeDisabled();
			});
		});

		test('partial messages are preserved after stopping', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([{ type: 'ai', content: 'Partial response', id: 'ai-1' }]);
				mockModule.setIsLoading(true);
			});
			mockModule.mockStreamCallbacks.stop = vi.fn(() => mockModule.setIsLoading(false));

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			await screen.findByText('Partial response');

			await user.click(within(document.getElementById('input_form')!).getByRole('button'));

			await waitFor(() => {
				expect(screen.getByText('Partial response')).toBeInTheDocument();
			});
		});

		test('input is re-enabled after stopping', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => mockModule.setIsLoading(true));
			mockModule.mockStreamCallbacks.stop = vi.fn(() => mockModule.setIsLoading(false));

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());

			await user.click(within(document.getElementById('input_form')!).getByRole('button'));

			await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
		});
	});

	describe('when rendered with existing thread messages', () => {
		test('displays messages view immediately', async () => {
			mockModule.setMessages([
				{ type: 'human', content: 'Previous question', id: 'msg-1' },
				{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
			]);

			renderChat();

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
				expect(screen.getByText('Previous answer')).toBeInTheDocument();
			});
		});
	});

	describe('when a user message is edited', () => {
		test('shows a textarea when the edit button is hovered and clicked', async () => {
			const user = userEvent.setup();
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);

			renderChat();

			const messageCard = await screen.findByText('Original message');
			await user.hover(messageCard);

			const editButton = await screen.findByTitle(/edit/i);
			await user.click(editButton);

			const textarea = screen.getByDisplayValue('Original message');
			expect(textarea).toBeInTheDocument();
		});

		test('pressing Escape cancels editing and restores the message', async () => {
			const user = userEvent.setup();
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);

			renderChat();

			const messageCard = await screen.findByText('Original message');
			await user.hover(messageCard);
			await user.click(await screen.findByTitle(/edit/i));

			await user.keyboard('{Escape}');

			expect(screen.queryByDisplayValue('Original message')).not.toBeInTheDocument();
			expect(screen.getByText('Original message')).toBeInTheDocument();
		});

		test('submits edited message with parent checkpoint on Enter', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			const mockGetMetadata = vi.fn().mockReturnValue({
				firstSeenState: { parent_checkpoint: { id: 'checkpoint-1' } }
			});
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			mockModule.mockStreamCallbacks.getMessagesMetadata = mockGetMetadata;
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);

			renderChat();

			const messageCard = await screen.findByText('Original message');
			await user.hover(messageCard);
			await user.click(await screen.findByTitle(/edit/i));

			const textarea = screen.getByDisplayValue('Original message');
			await user.clear(textarea);
			await user.type(textarea, 'Edited message');
			await user.keyboard('{Enter}');

			expect(mockSubmit).toHaveBeenCalledWith(
				{ messages: [{ type: 'human', content: 'Edited message' }] },
				{ checkpoint: { id: 'checkpoint-1' } }
			);
		});
	});

	describe('when an AI message is regenerated', () => {
		test('submits with undefined input and the parent checkpoint', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			const mockGetMetadata = vi.fn().mockReturnValue({
				firstSeenState: { parent_checkpoint: { id: 'checkpoint-ai-1' } }
			});
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			mockModule.mockStreamCallbacks.getMessagesMetadata = mockGetMetadata;
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderChat();

			const aiMessage = await screen.findByText('AI response');
			await user.hover(aiMessage);

			await user.click(await screen.findByTitle(/re-try/i));

			expect(mockSubmit).toHaveBeenCalledWith(undefined, {
				checkpoint: { id: 'checkpoint-ai-1' }
			});
		});
	});

	describe('when stream errors before any messages arrive', () => {
		test('shows the error instead of the suggestions screen', async () => {
			mockModule.setError(new Error('Connection failed'));

			renderChat();

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
				expect(screen.getByText('Connection failed')).toBeInTheDocument();
			});
		});
	});

	describe('when retry is triggered after a generation error', () => {
		test('shows the waiting indicator while the new response loads', async () => {
			const user = userEvent.setup();
			let submitCount = 0;

			// First submit ends with an error; retry starts a new loading sequence.
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				submitCount++;
				if (submitCount === 1) {
					mockModule.setError(new Error('Generation failed'));
				} else {
					mockModule.setError(null);
					mockModule.setIsLoading(true);
				}
			});

			renderChat();

			// Submit a message — this sets last_user_message, which retryGenerationAfterError() requires.
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			// Wait for the retry button to appear
			const retryButton = await screen.findByRole('button', { name: m.chat_error_retry() });

			// Click retry — should transition to loading/waiting state
			await user.click(retryButton);

			await waitFor(() => {
				expect(screen.getByRole('status')).toBeInTheDocument();
			});
		});
	});
});
