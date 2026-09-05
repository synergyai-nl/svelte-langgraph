import { describe, test, expect, vi, beforeEach } from 'vitest';
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
 * renders only the mechanics (history-loading skeleton / MessagesList / Composer), not the
 * suggestions empty state — that moved to `ChatSurface`, which layers `Suggestions` in via
 * `Conversation`'s `children` render-prop. Assertions about the suggestions screen itself
 * (`heading`, "switches from suggestions to messages") were ported onto `ChatSurface.svelte.test.ts`
 * instead; everything else here is a mechanical 1:1 port.
 */

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('../__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

function renderConversation(overrides: Record<string, unknown> = {}) {
	const client = makeMockClient();
	const ctx = makeContext({ client, assistantId: 'assistant-1' });
	return render(LangGraphHost, {
		props: { ctx, component: Conversation, threadId: 'test-123', ...overrides }
	});
}

beforeEach(() => {
	mockModule.resetMock();
});

describe('Conversation', () => {
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
			// The default composition (Composer/MessagesList) must not render at all.
			expect(screen.queryByPlaceholderText('Ask your agent…')).not.toBeInTheDocument();
		});
	});
});
