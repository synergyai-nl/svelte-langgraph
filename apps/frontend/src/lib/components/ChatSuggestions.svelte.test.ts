import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import ChatSuggestions from './ChatSuggestions.svelte';
import type { ChatSuggestion } from './ChatSuggestions.svelte';

const suggestions: ChatSuggestion[] = [
	{ title: 'First Title', description: 'First description', suggestedText: 'first suggestion' },
	{ title: 'Second Title', description: 'Second description', suggestedText: 'second suggestion' }
];

function renderSuggestions(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatSuggestions, {
		suggestions,
		introTitle: 'Welcome',
		intro: 'How can I help?',
		onSuggestionClick: vi.fn(),
		...overrides
	});
}

describe('ChatSuggestions', () => {
	describe('when rendered with suggestions', () => {
		beforeEach(() => {
			renderSuggestions();
		});

		test('displays the intro title as heading', () => {
			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
		});

		test('displays the intro text', () => {
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		test('renders a button for each suggestion', () => {
			expect(screen.getByRole('button', { name: /First Title/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /Second Title/i })).toBeInTheDocument();
		});
	});

	test('calls onSuggestionClick with correct text when suggestion clicked', async () => {
		const user = userEvent.setup();
		const onSuggestionClick = vi.fn();
		renderSuggestions({ onSuggestionClick });

		await user.click(screen.getByRole('button', { name: /First Title/i }));
		expect(onSuggestionClick).toHaveBeenCalledWith('first suggestion');
	});

	describe('when rendered with empty suggestions', () => {
		beforeEach(() => {
			renderSuggestions({ suggestions: [] });
		});

		test('still displays intro title and text', () => {
			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		test('does not render any suggestion buttons', () => {
			expect(screen.queryAllByRole('button')).toHaveLength(0);
		});
	});
});
