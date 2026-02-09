import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
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

	describe('when generationError is set', () => {
		const error = new Error('Something went wrong');

		beforeEach(() => {
			renderMessages({ generationError: error, onRetryError: vi.fn() });
		});

		test('displays the error message', () => {
			expect(screen.getByText('Something went wrong')).toBeInTheDocument();
		});

		test('displays retry button when onRetryError is provided', () => {
			expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
		});
	});

	test('calls onRetryError when retry button is clicked', async () => {
		const user = userEvent.setup();
		const onRetryError = vi.fn();
		const error = new Error('Something went wrong');

		renderMessages({ generationError: error, onRetryError });

		await user.click(screen.getByRole('button', { name: /retry/i }));
		expect(onRetryError).toHaveBeenCalledOnce();
	});
});
