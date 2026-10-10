import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { screen, waitFor, within } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import Chat from './Chat.svelte';
import type { TitleClient } from '$lib/langgraph/threadTitle';
import type { ChatSuggestion } from './ChatSuggestions.svelte';
import * as mockModule from './__tests__/mockUseStream.svelte';
import * as m from '$lib/paraglide/messages.js';

// Feedback posts straight to Aegra, so the module reads the backend URL from
// `$env/dynamic/public` — a SvelteKit global that only exists at runtime.
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_LANGGRAPH_API_URL: 'https://backend.test' }
}));

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Provide assistants.getSchemas so createStateSync degrades gracefully (returns null schema).
// `threads` backs the titler's metadata reads and writes.
const mockClient = {
	assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) },
	threads: {
		get: vi.fn().mockResolvedValue({ metadata: {} }),
		update: vi.fn().mockResolvedValue({})
	}
} as unknown as TitleClient;

/** The `threads` mock, typed for assertions. */
const mockThreads = (mockClient as unknown as { threads: { get: Mock; update: Mock } }).threads;

const suggestions: ChatSuggestion[] = [
	{ title: 'Suggestion 1', description: 'Desc 1', suggestedText: 'Tell me about AI' },
	{ title: 'Suggestion 2', description: 'Desc 2', suggestedText: 'Help me code' }
];

function renderChat(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(Chat, {
		langGraphClient: mockClient,
		accessToken: 'test-token',
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
	mockThreads.get.mockReset().mockResolvedValue({ metadata: {} });
	mockThreads.update.mockReset().mockResolvedValue({});
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
		const FEEDBACK_URL = 'https://backend.test/feedback';

		function mockFeedbackFetch() {
			return vi.fn(
				async () =>
					new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
			);
		}

		/** Hover the message with `text` and click one of ITS rating buttons.
		 *  Scoped with `within` because every AI message renders its own pair.
		 *  Stops at the click, which only opens the comment box — see `rate`. */
		async function clickRating(title: RegExp, text = 'AI response') {
			const user = userEvent.setup();
			const aiMessage = await screen.findByText(text);
			await user.hover(aiMessage);
			const group = aiMessage.closest('[role="group"]') as HTMLElement;
			await user.click(await within(group).findByTitle(title));
			return user;
		}

		/** Click a rating and then resolve the comment box it opens.
		 *
		 *  Nothing is sent until the box resolves, so every rating goes through it.
		 *  Cancelling is the no-comment path, which is what most of these assert. */
		async function rate(title: RegExp, text = 'AI response', comment?: string) {
			const user = await clickRating(title, text);

			const dialog = await screen.findByTestId('feedback-dialog');
			if (comment === undefined) {
				await user.click(within(dialog).getByTestId('feedback-cancel'));
			} else {
				// Pasted rather than typed because bits-ui's dialog focus scope pulls
				// focus off the field after the first state-driven update under
				// jsdom, so `user.type` lands only the first character or two. This
				// afflicts any dialog, not this one — a bare <textarea bind:value>
				// in a plain Dialog.Root truncates identically. Pasting sidesteps
				// focus entirely, which means the only proof a user can actually
				// type a comment is the `pressSequentially` case in
				// e2e/src/feedback.spec.ts. Do not weaken that one.
				// Retried because that same focus scope can steal focus before the
				// paste lands at all when the suite runs under load.
				const box = within(dialog).getByTestId('feedback-comment');
				await waitFor(async () => {
					if ((box as HTMLTextAreaElement).value !== comment) {
						await user.click(box);
						await user.paste(comment);
					}
					expect(box).toHaveValue(comment);
				});
				await user.click(within(dialog).getByTestId('feedback-submit'));
			}

			// The open box blocks pointer events on <body> and only releases them
			// once it has actually left the DOM. Without this wait the next hover —
			// here or in the following test — is refused.
			await waitFor(() => expect(screen.queryByTestId('feedback-dialog')).not.toBeInTheDocument());
			// The style outlives the node by a tick, which only shows up when the
			// same message is rated twice in a row.
			await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
		}

		/** An answer as the backend stores it: stamped with its producing run. */
		function stampedAnswer(id: string, content: string) {
			return { type: 'ai', content, id, response_metadata: { run_id: `run-of-${id}` } };
		}

		const metadataKeys = () =>
			mockThreads.update.mock.calls.flatMap(([, body]) =>
				Object.keys((body as { metadata?: object }).metadata ?? {})
			);

		test('posts the message id with the caller token, and nothing else', async () => {
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			renderChat();
			await rate(/good response/i);

			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
					FEEDBACK_URL,
					expect.objectContaining({
						// The run is resolved server-side, so the client can't point
						// a rating at another run's trace.
						body: JSON.stringify({ thread_id: 'test-123', message_id: 'ai-1', score: 'up' }),
						headers: expect.objectContaining({ Authorization: 'Bearer test-token' })
					})
				);
			});
			// Submit-only: no rating is stored anywhere to be read back.
			expect(metadataKeys()).toEqual([]);
		});

		test('rates each answer on its own, even two from one run', async () => {
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.setMessages([
				{ ...stampedAnswer('ai-1', 'First answer'), response_metadata: { run_id: 'same' } },
				{ ...stampedAnswer('ai-2', 'Second answer'), response_metadata: { run_id: 'same' } }
			]);

			renderChat();
			await rate(/good response/i, 'First answer');
			await rate(/bad response/i, 'Second answer');

			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
			const bodies = calls.map(([, init]) => JSON.parse(String(init.body)));
			expect(bodies).toEqual([
				{ thread_id: 'test-123', message_id: 'ai-1', score: 'up' },
				{ thread_id: 'test-123', message_id: 'ai-2', score: 'down' }
			]);
			// The first stays acknowledged; rating the second didn't touch it.
			const first = (await screen.findByText('First answer')).closest('[role="group"]');
			expect(within(first as HTMLElement).getByTitle(/good response/i)).toHaveClass('bg-muted');
		});

		test('a pre-stamp answer cannot be rated', async () => {
			const fetchMock = mockFeedbackFetch();
			vi.stubGlobal('fetch', fetchMock);
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderChat();
			const group = (await screen.findByText('AI response')).closest('[role="group"]');

			expect(within(group as HTMLElement).getByTitle(/good response/i)).toBeDisabled();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		test('a remount forgets the submitted state, so the answer can be rated again', async () => {
			vi.stubGlobal('fetch', mockFeedbackFetch());
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			const { unmount } = renderChat();
			await rate(/good response/i);
			await waitFor(() => expect(screen.getByTitle(/good response/i)).toBeDisabled());
			unmount();

			renderChat();
			expect(await screen.findByTitle(/good response/i)).toBeEnabled();
		});

		test("a request pending in one thread doesn't reach the next thread's buttons", async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise<Response>(() => {}))
			);
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			const { unmount } = renderChat();
			await rate(/good response/i);
			expect(await screen.findByTestId('feedback-pending')).toBeInTheDocument();
			unmount();

			// The route remounts Chat per thread via {#key threadId}.
			renderChat({ threadId: 'other-thread' });
			expect(await screen.findByTitle(/good response/i)).toBeEnabled();
			expect(screen.queryByTestId('feedback-pending')).not.toBeInTheDocument();
		});
	});
});
