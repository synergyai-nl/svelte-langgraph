import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import ChatMessage from './ChatMessage.svelte';
import { anAIMessage, aUserMessage } from './__tests__/fixtures';

function renderAIComponent(overrides: Record<string, unknown> = {}) {
	const message = anAIMessage(overrides as Parameters<typeof anAIMessage>[0]);
	return renderWithProviders(ChatMessage, { message });
}

function renderUserComponent(overrides: Record<string, unknown> = {}) {
	const message = aUserMessage(overrides as Parameters<typeof aUserMessage>[0]);
	return renderWithProviders(ChatMessage, { message });
}

describe('ChatMessage', () => {
	describe('when rendering an AI message', () => {
		beforeEach(() => {
			renderAIComponent();
		});

		test('renders the message in a card', () => {
			expect(screen.getByRole('group')).toBeInTheDocument();
		});

		test('shows the AI avatar', () => {
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

		test('shows the user avatar', () => {
			expect(screen.getByRole('group')).toBeInTheDocument();
		});

		test('displays the message text', () => {
			expect(screen.getByText('Hello from user')).toBeInTheDocument();
		});
	});
});
