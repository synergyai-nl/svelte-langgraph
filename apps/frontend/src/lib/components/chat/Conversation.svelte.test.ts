import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { screen, waitFor, within, render, fireEvent } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import LangGraphHost from './__tests__/LangGraphHost.svelte';
import Conversation, { type ConversationApi } from './Conversation.svelte';
import { makeContext, makeMockClient } from './__tests__/testContext.js';
import * as mockModule from '../__tests__/mockUseStream.svelte';
import * as m from '#lib/paraglide/messages.js';

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
	return { useStream: vi.fn(() => mod.mockStream), ...mod.mockSelectors };
});

// `threads` backs the titler's metadata reads and writes; `submitFeedback` backs ratings.
const submitFeedbackMock = vi.fn();
const threadsGetMock: Mock = vi.fn();
const threadsUpdateMock: Mock = vi.fn();
const threadsGetHistoryMock: Mock = vi.fn();

/** Thread history where the message `id` first shows in checkpoint `c2`, after `c1`. */
function historyWith(id: string) {
	threadsGetHistoryMock.mockResolvedValue([
		{
			checkpoint: { checkpoint_id: 'c2' },
			parent_checkpoint: { checkpoint_id: 'c1' },
			values: { messages: [{ id }] }
		},
		{ checkpoint: { checkpoint_id: 'c1' }, parent_checkpoint: null, values: { messages: [] } }
	]);
}

function renderConversation(overrides: Record<string, unknown> = {}) {
	const client = makeMockClient({
		threads: { get: threadsGetMock, update: threadsUpdateMock, getHistory: threadsGetHistoryMock },
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
	threadsGetHistoryMock.mockReset().mockResolvedValue([]);
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

		test('submits the edited message, forked from the parent checkpoint, on Enter', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			historyWith('user-1');
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);

			renderConversation();

			const messageCard = await screen.findByText('Original message');
			await user.hover(messageCard);
			await user.click(await screen.findByTitle(/edit/i));

			const textarea = screen.getByDisplayValue('Original message');
			await user.clear(textarea);
			await user.type(textarea, 'Edited message');
			await user.keyboard('{Enter}');

			await waitFor(() =>
				expect(mockSubmit).toHaveBeenCalledWith(
					{ messages: [{ type: 'human', content: 'Edited message', id: expect.any(String) }] },
					{ forkFrom: 'c1' }
				)
			);
			expect(threadsGetHistoryMock).toHaveBeenCalledExactlyOnceWith('test-123', {
				limit: 20,
				before: undefined
			});
			expect(screen.queryByDisplayValue('Edited message')).not.toBeInTheDocument();
		});
	});

	describe('when an AI message is regenerated', () => {
		test('submits with undefined input, forked from the parent checkpoint', async () => {
			const user = userEvent.setup();
			const mockSubmit = vi.fn();
			mockModule.mockStreamCallbacks.submit = mockSubmit;
			historyWith('ai-1');
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);

			renderConversation();

			const aiMessage = await screen.findByText('AI response');
			await user.hover(aiMessage);

			await user.click(await screen.findByTitle(/regenerate/i));

			await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(undefined, { forkFrom: 'c1' }));
		});
	});

	describe('when no checkpoint to fork from is found', () => {
		async function startEdit() {
			const user = userEvent.setup();
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);
			renderConversation();
			await user.hover(await screen.findByText('Original message'));
			await user.click(await screen.findByTitle(/edit/i));
			const textarea = screen.getByDisplayValue('Original message');
			await user.clear(textarea);
			await user.type(textarea, 'Edited message');
			await user.keyboard('{Enter}');
		}

		test('a failed history read on edit shows the error and keeps the editor', async () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			threadsGetHistoryMock.mockRejectedValue(new Error('HTTP 500'));
			await startEdit();

			expect(await screen.findByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(screen.getByDisplayValue('Edited message')).toBeInTheDocument();
			expect(submit).not.toHaveBeenCalled();
		});

		test('a message not on the branch shows the error and keeps the editor', async () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			historyWith('another-message');
			await startEdit();

			expect(await screen.findByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(screen.getByDisplayValue('Edited message')).toBeInTheDocument();
			expect(submit).not.toHaveBeenCalled();
		});

		test('a failed history read on regenerate shows the error and starts nothing', async () => {
			const user = userEvent.setup();
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			threadsGetHistoryMock.mockRejectedValue(new Error('HTTP 500'));
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);
			renderConversation();

			await user.hover(await screen.findByText('AI response'));
			await user.click(await screen.findByTitle(/regenerate/i));

			expect(await screen.findByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(submit).not.toHaveBeenCalled();
		});
	});

	describe('when the server stamps an answer with its run', () => {
		test('the answer becomes rateable from the server values', async () => {
			const user = userEvent.setup();
			// The stream keeps showing its streamed copy, without the stamp.
			mockModule.setMessages([
				{ type: 'human', content: 'Hello', id: 'user-1' },
				{ type: 'ai', content: 'AI response', id: 'ai-1' }
			]);
			renderConversation();
			const aiMessage = await screen.findByText('AI response');
			await user.hover(aiMessage);
			const group = aiMessage.closest('[role="group"]') as HTMLElement;
			expect(await within(group).findByTitle(/good response/i)).toBeDisabled();

			mockModule.emitValues({
				messages: [
					{ type: 'ai', content: 'AI response', id: 'ai-1', response_metadata: { run_id: 'run-1' } }
				]
			});

			await waitFor(() => expect(within(group).getByTitle(/good response/i)).toBeEnabled());
		});
	});

	describe('when stream errors before any messages arrive', () => {
		test('shows the error, without a Retry: there is nothing to repeat', async () => {
			mockModule.setError(new Error('Connection failed'));

			renderConversation();

			await waitFor(() => {
				expect(screen.getByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			});
			expect(screen.queryByRole('button', { name: m.slg_chat_error_retry() })).toBeNull();
		});
	});

	type SubmitInput = { messages: Array<{ id: string }> };

	/**
	 * Like the real stream: the sent message shows at once, and `submit` resolves once the run
	 * settles, with the error in `stream.error` and the message marked `status`: `failed` when
	 * the server never stored it, `sent` when it did.
	 */
	function failSubmit(error: Error, status: 'failed' | 'sent') {
		mockModule.mockStreamCallbacks.submit = vi.fn(async (input) => {
			const { id } = (input as SubmitInput).messages[0];
			mockModule.setMessages([{ type: 'human', content: 'Hello', id }]);
			mockModule.setMetadata(id, { optimisticStatus: status });
			mockModule.setError(error);
		});
	}

	describe('when the server never stores a sent message', () => {
		function refuseSubmit() {
			failSubmit(new Error('HTTP 401 {"detail":"Unauthorized"}'), 'failed');
		}

		test('puts the text back in the composer and drops the message from the list', async () => {
			const user = userEvent.setup();
			refuseSubmit();
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => expect(textbox).toHaveValue('Hello'));
			expect(screen.getByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(document.querySelector('[data-message-type="user"]')).toBeNull();
		});

		test('an echo that arrives after the failure shows the message and empties the composer', async () => {
			const user = userEvent.setup();
			let sentId = '';
			mockModule.mockStreamCallbacks.submit = vi.fn(async (input) => {
				sentId = (input as SubmitInput).messages[0].id;
				mockModule.setMessages([{ type: 'human', content: 'Hello', id: sentId }]);
				mockModule.setMetadata(sentId, { optimisticStatus: 'failed' });
				mockModule.setError(new Error('Boom'));
			});
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');
			await waitFor(() => expect(textbox).toHaveValue('Hello'));
			expect(document.querySelector('[data-message-type="user"]')).toBeNull();

			// The status stays `failed`; the server's values carry the message after all.
			mockModule.emitValues({ messages: [{ type: 'human', content: 'Hello', id: sentId }] });

			await waitFor(() => expect(textbox).toHaveValue(''));
			expect(document.querySelector('[data-message-type="user"]')).toHaveTextContent('Hello');
			expect(screen.getByTestId('chat-error')).toBeInTheDocument();
		});

		test('keeps the message and an empty composer when the server stored it', async () => {
			const user = userEvent.setup();
			failSubmit(new Error('Generation failed'), 'sent');
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await screen.findByTestId('chat-error');
			expect(textbox).toHaveValue('');
			expect(document.querySelector('[data-message-type="user"]')).toHaveTextContent('Hello');
		});

		test('stopping a send the server already echoed keeps the message and puts nothing back', async () => {
			const user = userEvent.setup();
			// The echo arrived (`sent`), then Stop ends the run without an error.
			let settle!: () => void;
			mockModule.mockStreamCallbacks.submit = vi.fn((input) => {
				const { id } = (input as SubmitInput).messages[0];
				mockModule.setMessages([{ type: 'human', content: 'Hello', id }]);
				mockModule.setMetadata(id, { optimisticStatus: 'sent' });
				mockModule.setIsLoading(true);
				return new Promise<void>((resolve) => (settle = resolve));
			});
			const stop = vi.fn(() => {
				mockModule.setIsLoading(false);
				settle();
			});
			mockModule.mockStreamCallbacks.stop = stop;
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');
			await user.click(await screen.findByRole('button', { name: 'Stop generating' }));

			expect(stop).toHaveBeenCalledOnce();
			await waitFor(() => expect(textbox).toBeEnabled());
			expect(document.querySelector('[data-message-type="user"]')).toHaveTextContent('Hello');
			expect(textbox).toHaveValue('');
			expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument();
		});

		test('a submit that fails before its run starts shows the error and keeps the text', async () => {
			const user = userEvent.setup();
			// The stream rejects when setting up the thread fails, before the message shows.
			mockModule.mockStreamCallbacks.submit = vi.fn(async () => {
				throw new Error('Thread setup failed');
			});
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			expect(await screen.findByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			await waitFor(() => expect(textbox).toHaveValue('Hello'));
		});

		test('a refused edit drops the edited message and keeps the old branch', async () => {
			const user = userEvent.setup();
			historyWith('user-1');
			const branch = [
				{ type: 'human', content: 'Original message', id: 'user-1' },
				{ type: 'ai', content: 'Original answer', id: 'ai-1' }
			];
			mockModule.setMessages(branch);
			mockModule.mockStreamCallbacks.submit = vi.fn(async (input) => {
				const { id } = (input as SubmitInput).messages[0];
				mockModule.setMessages([...branch, { type: 'human', content: 'Edited', id }]);
				mockModule.setMetadata(id, { optimisticStatus: 'failed' });
				mockModule.setError(new Error('HTTP 401'));
			});
			renderConversation();

			await user.hover(await screen.findByText('Original message'));
			await user.click(await screen.findByTitle(/edit/i));
			const textarea = screen.getByDisplayValue('Original message');
			await user.clear(textarea);
			await user.type(textarea, 'Edited');
			await user.keyboard('{Enter}');

			await screen.findByTestId('chat-error');
			await waitFor(() => expect(screen.queryByText('Edited')).not.toBeInTheDocument());
			expect(screen.getByText('Original message')).toBeInTheDocument();
			expect(screen.getByText('Original answer')).toBeInTheDocument();
			expect(screen.getByPlaceholderText('Ask your agent…')).toHaveValue('');
		});

		test('retry sends the restored text and clears the composer', async () => {
			const user = userEvent.setup();
			refuseSubmit();
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');
			await waitFor(() => expect(textbox).toHaveValue('Hello'));
			const [first] = (mockModule.mockStreamCallbacks.submit as Mock).mock.calls[0];

			// The stream marks a known id `pending` again; here its echo arrives.
			const submit = vi.fn(async () => {
				mockModule.setError(null);
				mockModule.setMetadata((first as SubmitInput).messages[0].id, { optimisticStatus: 'sent' });
			});
			mockModule.mockStreamCallbacks.submit = submit;
			await user.click(screen.getByRole('button', { name: m.slg_chat_error_retry() }));

			// The same message id: a server that stored it after all replaces it.
			expect(submit).toHaveBeenCalledWith(first, expect.anything());
			await waitFor(() => expect(textbox).toHaveValue(''));
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

			// Submit a message: Retry repeats it.
			await user.type(screen.getByPlaceholderText('Ask your agent…'), 'Hello');
			await user.keyboard('{Enter}');

			// Wait for the retry button to appear
			const retryButton = await screen.findByRole('button', { name: m.slg_chat_error_retry() });

			// Click retry — should transition to loading/waiting state
			await user.click(retryButton);

			await waitFor(() => {
				expect(screen.getByRole('status')).toBeInTheDocument();
			});
		});
	});

	/** Render with the `children` or `empty` snippet and hand back the api it receives. */
	function renderForApi(slot: 'children' | 'empty' = 'children') {
		let api: ConversationApi | undefined;
		const snippet = createRawSnippet<[ConversationApi]>((getApi) => {
			api = getApi();
			return { render: () => '<div data-testid="api-probe"></div>' };
		});
		renderConversation({ [slot]: snippet });
		if (!api) throw new Error('the snippet did not render');
		return api;
	}

	describe('Retry repeats the last action', () => {
		/** Fails every submit; a message sent is marked `failed` (no echo). */
		function refuseAll() {
			const submit = vi.fn(async (input?: SubmitInput) => {
				const id = input?.messages[0]?.id;
				if (id) mockModule.setMetadata(id, { optimisticStatus: 'failed' });
				mockModule.setError(new Error('HTTP 401'));
			});
			mockModule.mockStreamCallbacks.submit = submit as (...args: unknown[]) => unknown;
			return submit;
		}

		const sentIds = (submit: Mock) =>
			submit.mock.calls.map(([input]) => (input as SubmitInput).messages[0].id);

		test('a restored text the user changed is not sent; the error clears', async () => {
			const submit = refuseAll();
			const api = renderForApi('empty');
			api.submit('Hello');
			await waitFor(() => expect(api.input).toBe('Hello'));
			api.setInput('Hello there');

			api.retry!();

			expect(api.error).toBeNull();
			expect(submit).toHaveBeenCalledOnce();
			expect(api.input).toBe('Hello there');
		});

		test('an echo after the user changed the restored text: Retry resends it, the draft stays', async () => {
			const submit = refuseAll();
			const api = renderForApi();
			api.submit('Hello');
			await waitFor(() => expect(api.input).toBe('Hello'));
			api.setInput('Hello there');
			mockModule.emitValues({
				messages: [{ type: 'human', content: 'Hello', id: sentIds(submit)[0] }]
			});

			api.retry!();

			expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
			expect(api.input).toBe('Hello there');
		});

		test('a text never put back (another draft was there) is sent again; the draft stays', async () => {
			const submit = refuseAll();
			const api = renderForApi();
			api.submit('Hello');
			api.setInput('Another draft');
			await waitFor(() => expect(api.error).not.toBeNull());

			api.retry!();

			expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
			expect(api.input).toBe('Another draft');
		});

		const throwOnSubmit = () => {
			const submit = vi.fn(async () => {
				throw new Error('Thread setup failed');
			});
			mockModule.mockStreamCallbacks.submit = submit;
			return submit;
		};

		test.each([
			['marked failed', refuseAll],
			['refused before it showed', throwOnSubmit]
		])('Send on the unchanged restored text reuses the id (%s)', async (_, refuse) => {
			const submit = refuse() as Mock;
			const api = renderForApi();
			api.submit('Hello');
			await waitFor(() => expect(api.input).toBe('Hello'));

			api.submit('Hello');

			const [first, second] = sentIds(submit);
			expect(second).toBe(first);
		});

		test('a refused edit is sent again from its fork point with the same id', async () => {
			historyWith('user-1');
			mockModule.setMessages([{ type: 'human', content: 'Original message', id: 'user-1' }]);
			const submit = refuseAll();
			const api = renderForApi();
			await api.edit(api.messages[0], 'Edited');
			await waitFor(() => expect(api.error).not.toBeNull());

			api.retry!();

			expect(submit.mock.calls[1]).toEqual([
				{ messages: [{ type: 'human', content: 'Edited', id: sentIds(submit)[0] }] },
				{ forkFrom: 'c1' }
			]);
			expect(threadsGetHistoryMock).toHaveBeenCalledOnce();
		});

		test('after a failed fork-point read, Retry reads again and then runs', async () => {
			const submit = refuseAll();
			threadsGetHistoryMock.mockRejectedValueOnce(new Error('HTTP 503'));
			mockModule.setMessages([{ type: 'ai', content: 'AI response', id: 'ai-1' }]);
			const api = renderForApi();
			await api.regenerate(api.messages[0]);
			await waitFor(() => expect(api.error).not.toBeNull());
			expect(submit).not.toHaveBeenCalled();
			historyWith('ai-1');

			api.retry!();

			await waitFor(() => expect(submit).toHaveBeenCalledWith(undefined, { forkFrom: 'c1' }));
		});
	});

	describe('submit without text', () => {
		test('a submit that fails before its run starts lands in error', async () => {
			// The stream rejects when setting up the thread fails, before any run starts.
			mockModule.mockStreamCallbacks.submit = vi.fn(async () => {
				throw new Error('Thread setup failed');
			});
			const api = renderForApi();

			api.submit();

			await waitFor(() => expect(api.error?.message).toBe('Thread setup failed'));
			expect(api.input).toBe('');
		});

		test('submits exactly { messages: [] }, adds no message and leaves input alone', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			mockModule.setMessages([
				{ type: 'human', content: 'Earlier question', id: 'user-1' },
				{ type: 'ai', content: 'Earlier answer', id: 'ai-1' }
			]);
			const api = renderForApi();
			api.setInput('draft');

			api.submit();

			expect(submit).toHaveBeenCalledExactlyOnceWith({ messages: [] });
			expect(api.messages.map((msg) => msg.id)).toEqual(['user-1', 'ai-1']);
			expect(api.input).toBe('draft');
		});

		test('does nothing before the thread history has loaded', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			mockModule.setIsThreadLoading(true);
			const api = renderForApi();

			api.submit();
			expect(submit).not.toHaveBeenCalled();

			mockModule.setIsThreadLoading(false);
			api.submit();
			expect(submit).toHaveBeenCalledExactlyOnceWith({ messages: [] });
		});

		test('is refused while a run is active', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			mockModule.setIsLoading(true);
			const api = renderForApi();

			api.submit();

			expect(submit).not.toHaveBeenCalled();
		});

		test('surfaces a failure like a failed submit with text; Retry repeats it as such', async () => {
			const submit = vi.fn(async () => {
				mockModule.setError(new Error('Generation failed'));
			});
			mockModule.mockStreamCallbacks.submit = submit;
			// `empty` keeps the default composition, so the error card renders as for text.
			const api = renderForApi('empty');

			api.submit();

			expect(await screen.findByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(api.error?.message).toBe('Generation failed');
			expect(screen.getByPlaceholderText('Ask your agent…')).toHaveValue('');

			api.retry!();
			expect(submit.mock.calls).toEqual([[{ messages: [] }], [{ messages: [] }]]);
		});

		test('an empty string is sent as a human message, not treated as no text', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			const api = renderForApi();

			api.submit('');

			expect(submit).toHaveBeenCalledExactlyOnceWith(
				{ messages: [{ type: 'human', content: '', id: expect.any(String) }] },
				expect.anything()
			);
		});

		test('text is sent as a human message and clears input', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			const api = renderForApi();
			api.setInput('Hello');

			api.submit('Hello');

			expect(submit).toHaveBeenCalledExactlyOnceWith(
				{ messages: [{ type: 'human', content: 'Hello', id: expect.any(String) }] },
				expect.anything()
			);
			expect(api.input).toBe('');
		});

		test('text is not sent before the thread history has loaded', () => {
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			mockModule.setIsThreadLoading(true);
			const api = renderForApi();
			api.setInput('Hello');

			api.submit('Hello');

			expect(submit).not.toHaveBeenCalled();
			expect(api.input).toBe('Hello');
		});

		test('the default composer is off while the thread history loads', async () => {
			mockModule.setIsThreadLoading(true);
			renderConversation();
			const textbox = screen.getByPlaceholderText('Ask your agent…');

			expect(textbox).toBeDisabled();

			mockModule.setIsThreadLoading(false);
			await waitFor(() => expect(textbox).toBeEnabled());
		});

		test('the default composer does not submit blank input', async () => {
			const user = userEvent.setup();
			const submit = vi.fn();
			mockModule.mockStreamCallbacks.submit = submit;
			renderConversation();

			const textbox = screen.getByPlaceholderText('Ask your agent…');
			await user.type(textbox, '   ');
			await user.keyboard('{Enter}');
			await fireEvent.submit(textbox.closest('form')!);

			expect(submit).not.toHaveBeenCalled();
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
