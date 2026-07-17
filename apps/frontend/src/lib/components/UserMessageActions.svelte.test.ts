import { describe, test, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import UserMessageActions from './UserMessageActions.svelte';

function renderComponent(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(UserMessageActions, { onEdit: vi.fn(), ...overrides });
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
	});

	describe('when isHovered is false', () => {
		beforeEach(() => {
			renderComponent({ isHovered: false });
		});

		test('hides the edit button when not hovered', () => {
			expect(screen.getByTitle(/edit/i)).not.toBeVisible();
		});
	});

	describe('when edit button is clicked', () => {
		test('calls onEdit callback', async () => {
			const user = userEvent.setup();
			const onEdit = vi.fn();
			renderComponent({ isHovered: true, onEdit });

			await user.click(screen.getByTitle(/edit/i));

			expect(onEdit).toHaveBeenCalledOnce();
		});
	});
});
