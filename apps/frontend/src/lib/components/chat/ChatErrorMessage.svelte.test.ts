import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render';
import ChatErrorMessage from './ChatErrorMessage.svelte';
import * as m from '$lib/paraglide/messages.js';

const error = new Error('HTTP 401 {"detail":"Unauthorized"}');

function renderComponent(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatErrorMessage, { error, ...overrides });
}

describe('ChatErrorMessage', () => {
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleError.mockRestore();
	});

	describe('when rendered with an error', () => {
		beforeEach(() => {
			renderComponent({ onRetry: vi.fn() });
		});

		test('shows the localized generic text, not the raw error', () => {
			expect(screen.getByTestId('chat-error')).toHaveTextContent(m.slg_error_generic());
			expect(screen.queryByText(error.message)).not.toBeInTheDocument();
		});

		test('logs the raw error', () => {
			expect(consoleError).toHaveBeenCalledWith(error);
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
