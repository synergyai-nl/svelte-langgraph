import { describe, test, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import ChatMessage from './ChatMessage.svelte';
import { anAIMessage, aUserMessage } from './__tests__/fixtures';

function renderAIComponent(overrides: Record<string, unknown> = {}) {
	const message = anAIMessage(overrides as Parameters<typeof anAIMessage>[0]);
	return renderWithProviders(ChatMessage, { message, onEdit: vi.fn(), onRegenerate: vi.fn() });
}

function renderUserComponent(overrides: Record<string, unknown> = {}) {
	const message = aUserMessage(overrides as Parameters<typeof aUserMessage>[0]);
	return renderWithProviders(ChatMessage, { message, onEdit: vi.fn(), onRegenerate: vi.fn() });
}

describe('ChatMessage', () => {
	describe('when rendering an AI message', () => {
		beforeEach(() => {
			renderAIComponent();
		});

		test('renders the message group container', () => {
			expect(screen.getByRole('group')).toBeInTheDocument();
		});

		test('displays the message text', () => {
			expect(screen.getByText('Hello from AI')).toBeInTheDocument();
		});
	});

	describe('when rendering a user message', () => {
		beforeEach(() => {
			renderUserComponent();
		});

		test('renders the message group container', () => {
			expect(screen.getByRole('group')).toBeInTheDocument();
		});

		test('displays the message text', () => {
			expect(screen.getByText('Hello from user')).toBeInTheDocument();
		});
	});

	describe('when rendering an AI message with thinking', () => {
		test('shows the thinking block toggle button', () => {
			renderAIComponent({ thinking: 'Let me think about this...' });
			expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
		});

		test('does not show thinking block when thinking is absent', () => {
			renderAIComponent();
			expect(screen.queryByRole('button', { name: /thinking/i })).not.toBeInTheDocument();
		});
	});

	describe('when rendering a reasoning-only AI message (thinking, no text)', () => {
		beforeEach(() => {
			renderAIComponent({ text: '', thinking: 'Let me think about this...' });
		});

		test('shows the thinking block toggle button', () => {
			expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
		});

		test('does not render a message card or copy action', () => {
			const buttons = screen.queryAllByRole('button');
			expect(buttons.some((b) => b.getAttribute('name') === 'copy')).toBe(false);
		});
	});

	describe('when rendering an AI message with both thinking and text', () => {
		beforeEach(() => {
			renderAIComponent({ text: 'Final answer', thinking: 'Let me think about this...' });
		});

		test('shows the thinking block toggle button', () => {
			expect(screen.getByRole('button', { name: /thinking/i })).toBeInTheDocument();
		});

		test('shows the message card with the copy action', () => {
			expect(screen.getByText('Final answer')).toBeInTheDocument();
			const buttons = screen.getAllByRole('button');
			expect(buttons.some((b) => b.getAttribute('name') === 'copy')).toBe(true);
		});
	});

	describe('when rendering an AI message with thinking and isThinkingActive', () => {
		test('marks the thinking pill as streaming when isThinkingActive is true', () => {
			const message = anAIMessage({ text: '', thinking: 'Let me think about this...' });
			renderWithProviders(ChatMessage, {
				message,
				onEdit: vi.fn(),
				onRegenerate: vi.fn(),
				isThinkingActive: true
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'true'
			);
		});

		test('does not mark the thinking pill as streaming when isThinkingActive is omitted', () => {
			renderAIComponent({ text: '', thinking: 'Let me think about this...' });

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'false'
			);
		});

		test('does not mark the thinking pill as streaming when isThinkingActive is false', () => {
			const message = anAIMessage({ text: '', thinking: 'Let me think about this...' });
			renderWithProviders(ChatMessage, {
				message,
				onEdit: vi.fn(),
				onRegenerate: vi.fn(),
				isThinkingActive: false
			});

			expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute(
				'data-streaming',
				'false'
			);
		});
	});
});
