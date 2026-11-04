import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render';
import ChatErrorMessage from './ChatErrorMessage.svelte';
import * as m from '$lib/paraglide/messages.js';

function renderComponent(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatErrorMessage, overrides);
}

describe('ChatErrorMessage', () => {
	describe('when rendered with a retry handler', () => {
		beforeEach(() => {
			renderComponent({ onRetry: vi.fn() });
		});

		test('shows the localized generic text', () => {
			expect(screen.getByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
		});

		test('renders the retry button', () => {
			expect(screen.getByRole('button', { name: m.slg_chat_error_retry() })).toBeInTheDocument();
		});
	});

	test('calls onRetry when retry button is clicked', async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();
		renderComponent({ onRetry });

		await user.click(screen.getByRole('button', { name: m.slg_chat_error_retry() }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test('renders no retry button without onRetry', () => {
		renderComponent();

		expect(screen.getByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
		expect(
			screen.queryByRole('button', { name: m.slg_chat_error_retry() })
		).not.toBeInTheDocument();
	});
});
