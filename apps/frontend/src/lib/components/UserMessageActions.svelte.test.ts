import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import UserMessageActions from './UserMessageActions.svelte';
import { aUserMessage } from './__tests__/fixtures';

function renderComponent(overrides: Record<string, unknown> = {}) {
	const message = aUserMessage();
	return renderWithProviders(UserMessageActions, { message, ...overrides });
}

describe('UserMessageActions', () => {
	describe('when isHovered is true', () => {
		beforeEach(() => {
			renderComponent({ isHovered: true });
		});

		test('renders the edit button', () => {
			expect(screen.getByTitle(/edit/i)).toBeInTheDocument();
		});

		test('edit button is disabled (coming soon)', () => {
			const button = screen.getByTitle(/edit/i) as HTMLButtonElement;
			expect(button).toBeDisabled();
		});
	});

	describe('when isHovered is false', () => {
		beforeEach(() => {
			renderComponent({ isHovered: false });
		});

		test('hides the edit button when not hovered', () => {
			expect(screen.getByTitle(/edit/i)).not.toBeVisible();
		});
	});
});
