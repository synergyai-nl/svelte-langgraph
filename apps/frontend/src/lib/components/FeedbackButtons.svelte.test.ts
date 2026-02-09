import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import FeedbackButtons from './FeedbackButtons.svelte';
import { aUserMessage } from './__tests__/fixtures';

function renderComponent(overrides: Record<string, unknown> = {}) {
	const message = aUserMessage();
	return renderWithProviders(FeedbackButtons, { message, ...overrides });
}

describe('FeedbackButtons', () => {
	describe('when rendered', () => {
		beforeEach(() => {
			renderComponent();
		});

		test('renders the thumbs up button', () => {
			expect(screen.getByTitle(/good response/i)).toBeInTheDocument();
		});

		test('renders the thumbs down button', () => {
			expect(screen.getByTitle(/bad response/i)).toBeInTheDocument();
		});

		test('both buttons are disabled (coming soon)', () => {
			const upButton = screen.getByTitle(/good response/i) as HTMLButtonElement;
			const downButton = screen.getByTitle(/bad response/i) as HTMLButtonElement;
			expect(upButton).toBeDisabled();
			expect(downButton).toBeDisabled();
		});
	});
});
