import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import ChatSuggestions from './ChatSuggestions.svelte';
import type { ChatSuggestion } from './ChatSuggestions.svelte';

const suggestions: ChatSuggestion[] = [
	{ title: 'First Title', description: 'First description', suggestedText: 'first suggestion' },
	{ title: 'Second Title', description: 'Second description', suggestedText: 'second suggestion' }
];

describe('ChatSuggestions', () => {
	describe('when rendered with suggestions', () => {
		it('should display the intro title as heading', () => {
			render(ChatSuggestions, {
				props: {
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick: vi.fn()
				}
			});

			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
		});

		it('should display the intro text', () => {
			render(ChatSuggestions, {
				props: {
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick: vi.fn()
				}
			});

			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		it('should render a button for each suggestion', () => {
			render(ChatSuggestions, {
				props: {
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick: vi.fn()
				}
			});

			expect(screen.getByRole('button', { name: /First Title/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /Second Title/i })).toBeInTheDocument();
		});
	});

	describe('when a suggestion is clicked', () => {
		it('should call onSuggestionClick with the correct suggestedText', async () => {
			const user = userEvent.setup();
			const onSuggestionClick = vi.fn();

			render(ChatSuggestions, {
				props: {
					suggestions,
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick
				}
			});

			await user.click(screen.getByRole('button', { name: /First Title/i }));
			expect(onSuggestionClick).toHaveBeenCalledWith('first suggestion');
		});
	});

	describe('when rendered with empty suggestions', () => {
		it('should still display intro title and text', () => {
			render(ChatSuggestions, {
				props: {
					suggestions: [],
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick: vi.fn()
				}
			});

			expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
			expect(screen.getByText('How can I help?')).toBeInTheDocument();
		});

		it('should not render any suggestion buttons', () => {
			render(ChatSuggestions, {
				props: {
					suggestions: [],
					introTitle: 'Welcome',
					intro: 'How can I help?',
					onSuggestionClick: vi.fn()
				}
			});

			expect(screen.queryAllByRole('button')).toHaveLength(0);
		});
	});
});
