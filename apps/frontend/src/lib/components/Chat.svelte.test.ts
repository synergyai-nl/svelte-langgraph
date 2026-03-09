import { describe, test, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import { anAIMessage } from './__tests__/fixtures';
import Chat from './Chat.svelte';
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
	return renderWithProviders(Chat, {
		langGraphClient: mockClient,
		assistantId: 'assistant-1',
		thread: emptyThread,
		suggestions,
		introTitle: 'Welcome',
		intro: 'How can I help?',
		...overrides
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
		test('displays suggestions view', () => {
			mockStreamYield();
			renderChat();

			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		test('displays chat input', () => {
			mockStreamYield();
			renderChat();

			expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument();
		});
	});

	describe('when a suggestion is clicked', () => {
		test('switches from suggestions to messages view', async () => {
			const user = userEvent.setup();
			mockStreamYield(anAIMessage({ text: 'AI response' }));
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
			});
		});

		test('calls streamAnswer with correct args', async () => {
			const user = userEvent.setup();
			mockStreamYield(anAIMessage({ text: 'Response' }));
			renderChat();

			await user.click(screen.getByRole('button', { name: /Suggestion 1/i }));

			await waitFor(() => {
				expect(streamAnswer).toHaveBeenCalledWith(
					mockClient,
					'test-123',
					'assistant-1',
					expect.objectContaining({
						type: 'human',
						content: 'Tell me about AI',
						id: expect.any(String)
					}),
					expect.any(AbortSignal)
				);
			});
		});
	});

	describe('when a message is submitted', () => {
		test('switches to messages view', async () => {
			const user = userEvent.setup();
			mockStreamYield(anAIMessage({ text: 'Hello!' }));
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
			mockStreamYield(anAIMessage({ text: 'Hi there!' }));
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
			mockStreamYield(anAIMessage({ text: 'Hi there!' }));
			renderChat();

			const textbox = screen.getByPlaceholderText('Message...');
			await user.type(textbox, 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.getByText('Hi there!')).toBeInTheDocument();
			});
		});
	});

	describe('when stop is clicked', () => {
		test('stop button aborts the stream signal', async () => {
			const user = userEvent.setup();
			let capturedSignal: AbortSignal | undefined;

			vi.mocked(streamAnswer).mockImplementation(async function* (_c, _t, _a, _im, signal) {
				capturedSignal = signal;
				yield anAIMessage({ text: 'Partial...' });
				await new Promise<void>((r) => signal.addEventListener('abort', () => r()));
			});

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			const form = document.getElementById('input_form')!;
			const stopButton = await within(form).findByRole('button');
			await user.click(stopButton);

			expect(capturedSignal?.aborted).toBe(true);
		});

		test('aborting stream shows no error', async () => {
			const user = userEvent.setup();
			vi.mocked(streamAnswer).mockImplementation(async function* () {
				const empty: Message[] = [];
				yield* empty;
				throw new DOMException('Aborted', 'AbortError');
			});

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(screen.queryByRole('alert')).not.toBeInTheDocument();
				expect(screen.getByRole('textbox')).not.toBeDisabled();
			});
		});

		test('partial messages are preserved after stopping', async () => {
			const user = userEvent.setup();

			vi.mocked(streamAnswer).mockImplementation(async function* (_c, _t, _a, _im, signal) {
				yield anAIMessage({ text: 'Partial response' });
				await new Promise<void>((r) => signal.addEventListener('abort', () => r()));
			});

			renderChat();
			await user.type(screen.getByPlaceholderText('Message...'), 'Hello');
			await user.keyboard('{Enter}');

			await screen.findByText('Partial response');

			const stopButton = within(document.getElementById('input_form')!).getByRole('button');
			await user.click(stopButton);

			await waitFor(() => {
				expect(screen.getByText('Partial response')).toBeInTheDocument();
			});
		});

		test('input is re-enabled after stopping', async () => {
			const user = userEvent.setup();

			vi.mocked(streamAnswer).mockImplementation(async function* (_c, _t, _a, _im, signal) {
				yield anAIMessage({ text: 'Partial...' });
				await new Promise<void>((r) => signal.addEventListener('abort', () => r()));
			});

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
				expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
				expect(screen.getByText('Previous answer')).toBeInTheDocument();
			});
		});
	});
});
