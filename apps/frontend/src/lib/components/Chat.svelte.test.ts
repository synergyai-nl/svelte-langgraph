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
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
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

			const textbox = screen.getByPlaceholderText('Ask your agent…');
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

			const textbox = screen.getByPlaceholderText('Ask your agent…');
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

			const textbox = screen.getByPlaceholderText('Ask your agent…');
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
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
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
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
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
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
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
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
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

			await user.click(await screen.findByTitle(/regenerate/i));

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
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
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

	describe('when an AI message is rated', () => {
		function mockFeedbackFetch() {
			return vi.fn(async (input: unknown) => {
				const url = String(input);
				if (url === '/api/feedback/token') {
					return new Response(JSON.stringify({ url: '/api/feedback?token=signed-token' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					});
				}
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			});
		}

		/** Hover the message with `text` and click one of ITS rating buttons.
		 *  Scoped with `within` because every AI message renders its own pair. */
		async function rate(title: RegExp, text = 'AI response') {
			const user = userEvent.setup();
			const aiMessage = await screen.findByText(text);
			await user.hover(aiMessage);
			const group = aiMessage.closest('[role="group"]') as HTMLElement;
			await user.click(await within(group).findByTitle(title));
		}

		test('mints a token for the run that produced the message, then posts the score', async () => {
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.mockStreamCallbacks.getMessagesMetadata = vi.fn().mockReturnValue({
				firstSeenState: { metadata: { run_id: 'run-abc' } }
			});
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderChat();
			await rate(/good response/i);

			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledWith(
					'/api/feedback/token',
					expect.objectContaining({ body: JSON.stringify({ run_id: 'run-abc' }) })
				);
				expect(fetchMock).toHaveBeenCalledWith(
					'/api/feedback?token=signed-token',
					expect.objectContaining({ body: JSON.stringify({ score: 1 }) })
				);
			});
		});

		test('scores a message restored from history, with no live run', async () => {
			// Regression: feedback used to be minted only in onFinish, so a message
			// loaded from history had no URL and the click silently did nothing.
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.mockStreamCallbacks.getMessagesMetadata = vi.fn().mockReturnValue({
				firstSeenState: { metadata: { run_id: 'historical-run' } }
			});
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-old' }]);

			renderChat();
			await rate(/bad response/i);

			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledWith(
					'/api/feedback/token',
					expect.objectContaining({ body: JSON.stringify({ run_id: 'historical-run' }) })
				);
				expect(fetchMock).toHaveBeenCalledWith(
					'/api/feedback?token=signed-token',
					expect.objectContaining({ body: JSON.stringify({ score: 0 }) })
				);
			});
		});

		test("attributes the score to the message's own run, not the newest one", async () => {
			// Regression: onFinish stamped every unstamped AI message with the
			// *current* run's URL, so rating an older answer scored the newest trace.
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.mockStreamCallbacks.getMessagesMetadata = vi.fn((msg: unknown) => {
				const id = (msg as { id?: string }).id;
				return { firstSeenState: { metadata: { run_id: `run-for-${id}` } } };
			});
			mockModule.setMessages([
				{ type: 'ai', content: 'AI response', id: 'ai-old' },
				{ type: 'ai', content: 'Newest response', id: 'ai-new' }
			]);

			renderChat();
			await rate(/good response/i);

			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledWith(
					'/api/feedback/token',
					expect.objectContaining({ body: JSON.stringify({ run_id: 'run-for-ai-old' }) })
				);
			});
			expect(fetchMock).not.toHaveBeenCalledWith(
				'/api/feedback/token',
				expect.objectContaining({ body: JSON.stringify({ run_id: 'run-for-ai-new' }) })
			);
		});

		test('does not post when the message has no resolvable run id', async () => {
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.mockStreamCallbacks.getMessagesMetadata = vi.fn().mockReturnValue(undefined);
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderChat();
			await rate(/good response/i);

			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
