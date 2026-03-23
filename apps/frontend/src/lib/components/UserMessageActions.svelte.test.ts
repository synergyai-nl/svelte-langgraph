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

		test('edit button is enabled', () => {
			const button = screen.getByTitle(/edit/i) as HTMLButtonElement;
			expect(button).not.toBeDisabled();
		});

		test('calls onEdit when button is clicked', async () => {
			const message = aUserMessage();
			const onEdit = vi.fn();
			renderComponent({ isHovered: true, message, onEdit });

			const button = screen.getByTitle(/edit/i);
			await button.click();

			expect(onEdit).toHaveBeenCalledWith(message);
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
