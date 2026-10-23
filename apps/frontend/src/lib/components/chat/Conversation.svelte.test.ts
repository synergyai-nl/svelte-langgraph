import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { screen, waitFor, within, render } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import LangGraphHost from './__tests__/LangGraphHost.svelte';
import Conversation, { type ConversationApi } from './Conversation.svelte';
import { makeContext, makeMockClient } from './__tests__/testContext.js';
import * as mockModule from '../__tests__/mockUseStream.svelte';
import * as m from '$lib/paraglide/messages.js';

/**
 * Ported from the deleted `Chat.svelte.test.ts` (see git history at `906acf6`) onto `Conversation`,
 * the headless successor to `Chat.svelte` — see SLG-133 PR 3. `Conversation`'s default composition
 * renders only the mechanics (history-loading skeleton / MessagesList / MessageComposer), not the
 * suggestions empty state — that moved to `ChatSurface`, which fills `Conversation`'s `empty`
 * render-prop with `Suggestions`. Assertions about the suggestions screen itself
 * (`heading`, "switches from suggestions to messages") were ported onto `ChatSurface.svelte.test.ts`
 * instead; everything else here is a mechanical 1:1 port.
 */

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('../__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// `threads` backs the titler's metadata reads and writes; `submitFeedback` backs ratings.
const submitFeedbackMock = vi.fn();
const threadsGetMock: Mock = vi.fn();
const threadsUpdateMock: Mock = vi.fn();

function renderConversation(overrides: Record<string, unknown> = {}) {
	const client = makeMockClient({
		threads: { get: threadsGetMock, update: threadsUpdateMock },
		submitFeedback: submitFeedbackMock
	});
	const ctx = makeContext({ client, assistantId: 'assistant-1' });
	return render(LangGraphHost, {
		props: { ctx, component: Conversation, threadId: 'test-123', ...overrides }
	});
}

beforeEach(() => {
	mockModule.resetMock();
	threadsGetMock.mockReset().mockResolvedValue({ metadata: {} });
	threadsUpdateMock.mockReset().mockResolvedValue({});
	submitFeedbackMock.mockReset().mockResolvedValue(undefined);
});

describe('Conversation', () => {
	test('throws when rendered outside a <LangGraph> provider', () => {
		expect(() => render(Conversation, { props: { threadId: 'test-123' } })).toThrow(
			/<Conversation> must be rendered inside <LangGraph>/
		);
	});

	describe('when rendered with an empty thread', () => {
		test('displays the composer', () => {
			renderConversation();
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
		});
	});

	describe('when a message is submitted', () => {
		test('displays the user message', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([
					{ type: 'human', content: 'Hello', id: 'user-1' },
					{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
				]);
			});
			renderConversation();

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
			renderConversation();

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

			renderConversation();

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

			renderConversation();

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

			renderConversation();
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

			renderConversation();
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

			renderConversation();
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

			renderConversation();
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());

			await user.click(within(document.getElementById('input_form')!).getByRole('button'));

			await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
		});
	});

	describe('when rendered with existing thread messages', () => {
		test('displays the messages immediately, without the history-loading skeleton', async () => {
			mockModule.setMessages([
				{ type: 'human', content: 'Previous question', id: 'msg-1' },
				{ type: 'ai', content: 'Previous answer', id: 'msg-2' }
			]);

			renderConversation();

			await waitFor(() => {
				expect(screen.queryByTestId('chat-history-loading')).not.toBeInTheDocument();
				expect(screen.getByText('Previous answer')).toBeInTheDocument();
			});
		});
	});

	describe('when a user message is edited', () => {
		test('shows a textarea when the edit button is hovered and clicked', async () => {
			const user = userEvent.setup();
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);

			renderConversation();

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

			renderConversation();

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

			renderConversation();

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

			renderConversation();

			const aiMessage = await screen.findByText('AI response');
			await user.hover(aiMessage);

			await user.click(await screen.findByTitle(/regenerate/i));

			expect(mockSubmit).toHaveBeenCalledWith(undefined, {
				checkpoint: { id: 'checkpoint-ai-1' }
			});
		});
	});

	describe('when stream errors before any messages arrive', () => {
		test('shows the error', async () => {
			mockModule.setError(new Error('Connection failed'));

			renderConversation();

			await waitFor(() => {
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

			renderConversation();

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

	describe('empty render-prop', () => {
		function renderWithEmpty() {
			const client = makeMockClient();
			const ctx = makeContext({ client, assistantId: 'assistant-1' });
			const empty = createRawSnippet<[ConversationApi]>((getApi) => ({
				render: () => `<div data-testid="custom-empty">chatStarted=${getApi().chatStarted}</div>`
			}));
			return render(LangGraphHost, {
				props: { ctx, component: Conversation, threadId: 'test-123', empty }
			});
		}

		test('renders inside the default composition for a bare thread, receiving the ConversationApi', () => {
			renderWithEmpty();

			expect(screen.getByTestId('custom-empty')).toHaveTextContent('chatStarted=false');
			// It replaces only the message list — the rest of the default composition stays.
			expect(screen.getByPlaceholderText('Ask your agent…')).toBeInTheDocument();
		});

		test('does not render once the chat has started', () => {
			mockModule.setMessages([{ type: 'ai', content: 'Previous answer', id: 'ai-1' }]);
			renderWithEmpty();

			expect(screen.queryByTestId('custom-empty')).not.toBeInTheDocument();
			expect(screen.getByText('Previous answer')).toBeInTheDocument();
		});

		test('does not render while the thread history is loading', () => {
			mockModule.setIsThreadLoading(true);
			renderWithEmpty();

			expect(screen.queryByTestId('custom-empty')).not.toBeInTheDocument();
			expect(screen.getByTestId('chat-history-loading')).toBeInTheDocument();
		});

		test('switches to the message list once a message is submitted', async () => {
			const user = userEvent.setup();
			mockModule.mockStreamCallbacks.submit = vi.fn(() => {
				mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
			});
			renderWithEmpty();

			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.queryByTestId('custom-empty')).not.toBeInTheDocument();
				expect(screen.getByText('Hello')).toBeInTheDocument();
			});
		});
	});

	describe('children render-prop', () => {
		test('replaces the default composition and receives the ConversationApi', () => {
			mockModule.setMessages([{ type: 'ai', content: 'From api', id: 'ai-1' }]);

			const client = makeMockClient();
			const ctx = makeContext({ client, assistantId: 'assistant-1' });
			const children = createRawSnippet<[ConversationApi]>((getApi) => ({
				render: () => {
					const api = getApi();
					return `<div data-testid="custom-children">${api.messages.length} messages, isLoading=${api.isLoading}</div>`;
				}
			}));

			render(LangGraphHost, {
				props: { ctx, component: Conversation, threadId: 'test-123', children }
			});

			expect(screen.getByTestId('custom-children')).toHaveTextContent(
				'1 messages, isLoading=false'
			);
			// The default composition (MessageComposer/MessagesList) must not render at all.
			expect(screen.queryByPlaceholderText('Ask your agent…')).not.toBeInTheDocument();
		});
	});

	describe('when an AI message is rated', () => {
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
			threadsUpdateMock.mock.calls.flatMap(([, body]) =>
				Object.keys((body as { metadata?: object }).metadata ?? {})
			);

		test('rates through the client by message id, and stores nothing', async () => {
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			renderConversation();
			await rate(/good response/i);

			// The run is resolved server-side, so the client can't point a rating
			// at another run's trace.
			await waitFor(() =>
				expect(submitFeedbackMock).toHaveBeenCalledExactlyOnceWith(
					'test-123',
					'ai-1',
					'up',
					undefined
				)
			);
			// Submit-only: no rating is stored anywhere to be read back.
			expect(metadataKeys()).toEqual([]);
		});

		test('rates each answer on its own, even two from one run', async () => {
			mockModule.setMessages([
				{ ...stampedAnswer('ai-1', 'First answer'), response_metadata: { run_id: 'same' } },
				{ ...stampedAnswer('ai-2', 'Second answer'), response_metadata: { run_id: 'same' } }
			]);

			renderConversation();
			await rate(/good response/i, 'First answer');
			await rate(/bad response/i, 'Second answer');

			await waitFor(() => expect(submitFeedbackMock).toHaveBeenCalledTimes(2));
			expect(submitFeedbackMock.mock.calls).toEqual([
				['test-123', 'ai-1', 'up', undefined],
				['test-123', 'ai-2', 'down', undefined]
			]);
			// The first stays acknowledged; rating the second didn't touch it.
			const first = (await screen.findByText('First answer')).closest('[role="group"]');
			expect(within(first as HTMLElement).getByTitle(/good response/i)).toHaveClass('bg-muted');
		});

		test('a pre-stamp answer cannot be rated', async () => {
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderConversation();
			const group = (await screen.findByText('AI response')).closest('[role="group"]');

			expect(within(group as HTMLElement).getByTitle(/good response/i)).toBeDisabled();
			expect(submitFeedbackMock).not.toHaveBeenCalled();
		});

		test('a remount forgets the submitted state, so the answer can be rated again', async () => {
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			const { unmount } = renderConversation();
			await rate(/good response/i);
			await waitFor(() => expect(screen.getByTitle(/good response/i)).toBeDisabled());
			unmount();

			renderConversation();
			expect(await screen.findByTitle(/good response/i)).toBeEnabled();
		});

		test("a request pending in one thread doesn't reach the next thread's buttons", async () => {
			submitFeedbackMock.mockReturnValue(new Promise(() => {}));
			mockModule.setMessages([stampedAnswer('ai-1', 'AI response')]);

			const { unmount } = renderConversation();
			await rate(/good response/i);
			expect(await screen.findByTestId('feedback-pending')).toBeInTheDocument();
			unmount();

			// The route remounts Conversation per thread via {#key threadId}.
			renderConversation({ threadId: 'other-thread' });
			expect(await screen.findByTitle(/good response/i)).toBeEnabled();
			expect(screen.queryByTestId('feedback-pending')).not.toBeInTheDocument();
		});
	});
});
