import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import AIMessageActions from './AIMessageActions.svelte';
import { anAIMessage } from './__tests__/fixtures';

function renderComponent(overrides: Record<string, unknown> = {}) {
	const message = anAIMessage();
	return renderWithProviders(AIMessageActions, { message, ...overrides });
}

describe('AIMessageActions', () => {
	describe('when isHovered is true', () => {
		beforeEach(() => {
			renderComponent({ isHovered: true });
		});

		test('renders the copy button', () => {
			const buttons = screen.getAllByRole('button');
			expect(buttons.some((b) => b.getAttribute('name') === 'copy')).toBe(true);
		});

		test('renders the regenerate button', () => {
			expect(screen.getByTitle(/re-try/i)).toBeInTheDocument();
		});

		test('includes FeedbackButtons', () => {
			expect(screen.getByTitle(/good response/i)).toBeInTheDocument();
		});

		test('regenerate button is disabled (coming soon)', () => {
			const button = screen.getByTitle(/re-try/i) as HTMLButtonElement;
			expect(button).toBeDisabled();
		});
	});

	describe('when isHovered is false', () => {
		beforeEach(() => {
			renderComponent({ isHovered: false });
		});

		test('does not show any action buttons', () => {
			expect(screen.getByTitle(/re-try/i)).not.toBeVisible();
		});
	});
});
