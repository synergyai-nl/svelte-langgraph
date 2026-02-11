import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import ChatMessages from './ChatMessages.svelte';
import { anAIMessage, aUserMessage, aToolMessage } from './__tests__/fixtures';

function renderMessages(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatMessages, {
		messages: [],
		finalAnswerStarted: true,
		...overrides
	});
}

describe('ChatMessages', () => {
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
