import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from '../__tests__/render';
import MessagesList from './MessagesList.svelte';
import { anAIMessage, aUserMessage, aToolMessage } from '../__tests__/fixtures';

function renderMessages(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(MessagesList, {
		messages: [],
		finalAnswerStarted: true,
		onEdit: vi.fn(),
		onRegenerate: vi.fn(),
		...overrides
	});
}

describe('MessagesList', () => {
	describe('when rendered with messages', () => {
		test('renders AI messages with their text', () => {
			renderMessages({ messages: [anAIMessage()] });

			expect(screen.getByText('Hello from AI')).toBeInTheDocument();
		});

		test('renders user messages with their text', () => {
			renderMessages({ messages: [aUserMessage()] });

			expect(screen.getByText('Hello from user')).toBeInTheDocument();
		});

		test('renders tool messages', () => {
			renderMessages({ messages: [aToolMessage()] });

			expect(screen.getByText('search')).toBeInTheDocument();
		});

		test('does not render messages without text', () => {
			renderMessages({
				messages: [anAIMessage({ text: '', id: 'ai-empty' }), anAIMessage()]
			});

			expect(screen.getByText('Hello from AI')).toBeInTheDocument();
		});

		test('renders an AI message with only thinking and no text', () => {
			renderMessages({
				messages: [anAIMessage({ text: '', thinking: 'Let me think...', id: 'ai-thinking' })]
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
		});

		test('does not render a message card or copy action for a reasoning-only AI message', () => {
			renderMessages({
				messages: [anAIMessage({ text: '', thinking: 'Let me think...', id: 'ai-thinking' })]
			});

			const buttons = screen.queryAllByRole('button');
			expect(buttons.some((b) => b.getAttribute('name') === 'copy')).toBe(false);
		});

		test('does not render an AI message with no text and no thinking', () => {
			renderMessages({
				messages: [anAIMessage({ text: '', id: 'ai-empty' })]
			});

			expect(screen.queryByRole('group')).not.toBeInTheDocument();
		});
	});

	test('displays waiting indicator when no messages and finalAnswerStarted=false', () => {
		const { container } = renderMessages({ finalAnswerStarted: false });

		expect(container.querySelector('[role="status"]')).toBeInTheDocument();
	});

	test('renders mixed message types in order', () => {
		renderMessages({
			messages: [
				anAIMessage({ text: 'AI response', id: 'ai-1' }),
				aUserMessage({ text: 'User question', id: 'user-1' }),
				aToolMessage({ tool_name: 'search', id: 'tool-1' })
			]
		});

		expect(screen.getByText('AI response')).toBeInTheDocument();
		expect(screen.getByText('User question')).toBeInTheDocument();
		expect(screen.getByText('search')).toBeInTheDocument();
	});

	test('renders nothing when messages array is empty', () => {
		renderMessages({ messages: [] });

		expect(screen.queryByRole('group')).not.toBeInTheDocument();
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	describe('thinking pill streaming animation', () => {
		test('marks the last message as streaming when isStreaming is true', () => {
			renderMessages({
				messages: [anAIMessage({ text: '', thinking: 'Thinking...', id: 'ai-streaming' })],
				isStreaming: true
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'true'
			);
		});

		test('does not mark a completed message as streaming once isStreaming is false', () => {
			renderMessages({
				messages: [anAIMessage({ text: 'Done', thinking: 'Thinking...', id: 'ai-done' })],
				isStreaming: false
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'false'
			);
		});

		test('defaults to not streaming when isStreaming is omitted (e.g. historical messages after reload)', () => {
			renderMessages({
				messages: [anAIMessage({ text: 'Done', thinking: 'Thinking...', id: 'ai-historical' })]
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'false'
			);
		});

		test('only the last message animates when isStreaming is true and prior messages also have thinking', () => {
			renderMessages({
				messages: [
					anAIMessage({ text: 'Earlier answer', thinking: 'Earlier thinking...', id: 'ai-1' }),
					aUserMessage({ text: 'Follow-up question', id: 'user-2' }),
					anAIMessage({ text: '', thinking: 'Current thinking...', id: 'ai-2' })
				],
				isStreaming: true
			});

			const thinkingButtons = screen.getAllByRole('button', { name: /thinking/i });
			expect(thinkingButtons).toHaveLength(2);
			expect(thinkingButtons[0]).toHaveAttribute('data-streaming', 'false');
			expect(thinkingButtons[1]).toHaveAttribute('data-streaming', 'true');
		});
	});

	describe('when generationError is set', () => {
		const error = new Error('Something went wrong');

		beforeEach(() => {
			renderMessages({ generationError: error, onRetryError: vi.fn() });
		});

		test('displays the error message', () => {
			expect(screen.getByText('Something went wrong')).toBeInTheDocument();
		});
	});
});
