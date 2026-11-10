import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render';
import AIMessageActions from './AIMessageActions.svelte';
import { anAIMessage } from '../__tests__/fixtures';

const copyButton = () =>
	screen.getAllByRole('button').find((b) => b.getAttribute('name') === 'copy')!;

const tooltip = () => document.querySelector('[data-tooltip-content]');

function renderComponent(overrides: Record<string, unknown> = {}) {
	const message = anAIMessage();
	return renderWithProviders(AIMessageActions, { message, onRegenerate: () => {}, ...overrides });
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

		test('copy button keeps its pre-existing tabindex of -1', () => {
			expect(copyButton()).toHaveAttribute('tabindex', '-1');
		});

		test('renders the regenerate button', () => {
			expect(screen.getByTitle(/regenerate/i)).toBeInTheDocument();
		});

		test('includes FeedbackButtons', () => {
			expect(screen.getByTitle(/good response/i)).toBeInTheDocument();
		});

		test('regenerate button is enabled', () => {
			const button = screen.getByTitle(/regenerate/i) as HTMLButtonElement;
			expect(button).not.toBeDisabled();
		});
	});

	describe('when isHovered is false', () => {
		beforeEach(() => {
			renderComponent({ isHovered: false });
		});

		test('does not show any action buttons', () => {
			expect(screen.getByTitle(/regenerate/i)).not.toBeVisible();
		});
	});

	describe('when isHovered is false but a rating is pending or failed', () => {
		// The pointer leaving must not hide a marker the user still needs to
		// see — losing it on hover-out is what the regenerate button is free to
		// do, but a pending/failed rating is not just another action button.
		test.each([
			['pending', () => new Promise<void>(() => {}), 'feedback-pending'],
			['failed', () => Promise.reject(new Error('502')), 'feedback-failed']
		] as const)('stays visible for %s', async (_, onFeedback, marker) => {
			const user = userEvent.setup();
			vi.spyOn(console, 'error').mockImplementation(() => {});
			renderComponent({ isHovered: false, onFeedback });

			await user.click(screen.getByTitle(/good response/i));
			await user.click(await screen.findByTestId('feedback-submit'));

			await screen.findByTestId(marker);
			expect(screen.getByTitle(/regenerate/i)).toBeVisible();
		});
	});

	describe('copying', () => {
		afterEach(() => vi.unstubAllGlobals());

		function stubClipboard(writeText: (text: string) => Promise<void>) {
			// The tooltip positions itself with this, and jsdom has none.
			vi.stubGlobal(
				'ResizeObserver',
				class {
					observe() {}
					unobserve() {}
					disconnect() {}
				}
			);
			Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
			vi.stubGlobal('isSecureContext', true);
		}

		test('copies the message text and confirms it in the button and the tooltip', async () => {
			const user = userEvent.setup({ delay: null });
			const writeText = vi.fn().mockResolvedValue(undefined);
			stubClipboard(writeText);
			const message = anAIMessage();
			renderComponent({ message, isHovered: true });

			await user.hover(copyButton().closest('[data-slot="tooltip-trigger"]')!);
			await waitFor(() => expect(tooltip()).toHaveTextContent('Copy to clipboard'), {
				timeout: 3000
			});
			await user.click(copyButton());

			expect(writeText).toHaveBeenCalledWith(message.text);
			await waitFor(() => expect(copyButton()).toHaveTextContent('Copied'));
			await waitFor(() => expect(tooltip()).toHaveTextContent('Copied'));
		});

		test('announces a failed copy and the tooltip keeps the default copy text', async () => {
			const user = userEvent.setup({ delay: null });
			stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
			renderComponent({ isHovered: true });

			await user.hover(copyButton().closest('[data-slot="tooltip-trigger"]')!);
			await waitFor(() => expect(tooltip()).toHaveTextContent('Copy to clipboard'), {
				timeout: 3000
			});
			await user.click(copyButton());

			await waitFor(() => expect(copyButton()).toHaveTextContent('Failed to copy'));
			expect(tooltip()).toHaveTextContent('Copy to clipboard');
			expect(tooltip()).not.toHaveTextContent('Copied');
		});
	});
});
