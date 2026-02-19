import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import ChatErrorMessage from './ChatErrorMessage.svelte';
import * as m from '$lib/paraglide/messages.js';

function renderComponent(overrides: Record<string, unknown> = {}) {
	const error = new Error('Test error message');
	return renderWithProviders(ChatErrorMessage, {
		error,
		onRetry: vi.fn(),
		...overrides
	});
}

describe('ChatErrorMessage', () => {
	describe('when rendered with an error', () => {
		beforeEach(() => {
			renderComponent();
		});

		test('displays the error message', () => {
			expect(screen.getByText('Test error message')).toBeInTheDocument();
		});

		test('renders the retry button', () => {
			expect(screen.getByRole('button', { name: m.chat_error_retry() })).toBeInTheDocument();
		});
	});

	test('calls onRetry when retry button is clicked', async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();
		renderComponent({ onRetry });

		await user.click(screen.getByRole('button', { name: m.chat_error_retry() }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
