import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import ChatMessages from './ChatMessages.svelte';
import type { Message } from '$lib/langgraph/types';

const aiMessage: Message = { type: 'ai', text: 'Hello from AI', id: 'ai-1' };
const userMessage: Message = { type: 'user', text: 'Hello from user', id: 'user-1' };
const toolMessage: Message = {
	type: 'tool',
	text: 'Tool result',
	id: 'tool-1',
	tool_name: 'search',
	status: 'success'
};
const emptyTextMessage: Message = { type: 'ai', text: '', id: 'ai-empty' };

describe('ChatMessages', () => {
	describe('when rendered with messages', () => {
		it('should render AI messages with their text', () => {
			renderWithProviders(ChatMessages, {
				messages: [aiMessage],
				finalAnswerStarted: true
			});

			expect(screen.getByText('Hello from AI')).toBeInTheDocument();
		});

		it('should render user messages with their text', () => {
			renderWithProviders(ChatMessages, {
				messages: [userMessage],
				finalAnswerStarted: true
			});

			expect(screen.getByText('Hello from user')).toBeInTheDocument();
		});

		it('should render tool messages', () => {
			renderWithProviders(ChatMessages, {
				messages: [toolMessage],
				finalAnswerStarted: true
			});

			expect(screen.getByText('search')).toBeInTheDocument();
		});

		it('should not render messages without text', () => {
			renderWithProviders(ChatMessages, {
				messages: [emptyTextMessage, aiMessage],
				finalAnswerStarted: true
			});

			expect(screen.getByText('Hello from AI')).toBeInTheDocument();
		});
	});

	describe('when rendered with no messages and finalAnswerStarted=false', () => {
		it('should display the waiting indicator', () => {
			const { container } = renderWithProviders(ChatMessages, {
				messages: [],
				finalAnswerStarted: false
			});

			// ChatWaiting renders a spinner
			expect(container.querySelector('[role="status"]')).toBeInTheDocument();
		});
	});

	describe('when generationError is set', () => {
		it('should display the error message', () => {
			const error = new Error('Something went wrong');

			renderWithProviders(ChatMessages, {
				messages: [],
				finalAnswerStarted: true,
				generationError: error,
				onRetryError: vi.fn()
			});

			expect(screen.getByText('Something went wrong')).toBeInTheDocument();
		});

		it('should display retry button when onRetryError is provided', () => {
			const error = new Error('Something went wrong');

			renderWithProviders(ChatMessages, {
				messages: [],
				finalAnswerStarted: true,
				generationError: error,
				onRetryError: vi.fn()
			});

			expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
		});
	});

	describe('when retry button is clicked', () => {
		it('should call onRetryError', async () => {
			const user = userEvent.setup();
			const onRetryError = vi.fn();
			const error = new Error('Something went wrong');

			renderWithProviders(ChatMessages, {
				messages: [],
				finalAnswerStarted: true,
				generationError: error,
				onRetryError
			});

			await user.click(screen.getByRole('button', { name: /retry/i }));
			expect(onRetryError).toHaveBeenCalledOnce();
		});
	});
});
