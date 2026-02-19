import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import SuggestionCard from './SuggestionCard.svelte';

function renderComponent(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(SuggestionCard, {
		title: 'Test Title',
		description: 'Test description',
		onclick: vi.fn(),
		...overrides
	});
}

describe('SuggestionCard', () => {
	describe('when rendered with title and description', () => {
		beforeEach(() => {
			renderComponent();
		});

		test('displays the title', () => {
			expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument();
		});

		test('displays the description', () => {
			expect(screen.getByText('Test description')).toBeInTheDocument();
		});

		test('renders a button element', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	test('calls onclick when clicked', async () => {
		const user = userEvent.setup();
		const onclick = vi.fn();
		renderComponent({ onclick });

		await user.click(screen.getByRole('button'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
