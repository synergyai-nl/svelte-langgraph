import { describe, test, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import FeedbackButtons from './FeedbackButtons.svelte';

function renderComponent(props: Record<string, unknown> = {}) {
	return renderWithProviders(FeedbackButtons, props);
}

const up = () => screen.getByTitle(/good response/i);
const down = () => screen.getByTitle(/bad response/i);

async function rate(user: ReturnType<typeof userEvent.setup>, button: HTMLElement, comment = '') {
	await user.click(button);
	if (comment) {
		// Pasted and retried: the dialog's focus scope can steal focus mid-type.
		const box = await screen.findByTestId('feedback-comment');
		await waitFor(async () => {
			if ((box as HTMLTextAreaElement).value !== comment) {
				await user.click(box);
				await user.paste(comment);
			}
			expect(box).toHaveValue(comment);
		});
	}
	await user.click(await screen.findByTestId('feedback-submit'));
	// The open box locks pointer events on <body> until it has left the DOM.
	await waitFor(() => {
		expect(screen.queryByTestId('feedback-dialog')).not.toBeInTheDocument();
		expect(document.body.style.pointerEvents).not.toBe('none');
	});
}

describe('FeedbackButtons', () => {
	test('renders both thumbs, enabled', () => {
		renderComponent({ onSubmit: vi.fn() });
		expect(up()).toBeEnabled();
		expect(down()).toBeEnabled();
	});

	test('sends the rating and its comment together', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderComponent({ onSubmit });

		await rate(user, down(), 'too vague');

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith('down', 'too vague');
	});

	test('sends the rating without a comment when the box is cancelled', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderComponent({ onSubmit });

		await user.click(up());
		await user.click(await screen.findByTestId('feedback-cancel'));

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith('up', undefined);
	});

	test('acknowledges a landed rating and takes no more until remount', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderComponent({ onSubmit });

		await rate(user, up());

		await waitFor(() => expect(up()).toBeDisabled());
		expect(down()).toBeDisabled();
		expect(up()).toHaveClass('bg-muted');
		expect(screen.queryByTestId('feedback-failed')).not.toBeInTheDocument();
	});

	test('marks a failed rating, drops its highlight and allows a retry', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockRejectedValueOnce(new Error('502')).mockResolvedValue(undefined);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		renderComponent({ onSubmit });

		await rate(user, up());

		expect(await screen.findByTestId('feedback-failed')).toBeInTheDocument();
		expect(up()).not.toHaveClass('bg-muted');
		expect(up()).toBeEnabled();

		await rate(user, up());

		await waitFor(() => expect(up()).toBeDisabled());
		expect(onSubmit).toHaveBeenCalledTimes(2);
	});

	test('is disabled while the rating is in flight', async () => {
		const user = userEvent.setup();
		renderComponent({ onSubmit: () => new Promise(() => {}) });

		await rate(user, up());

		expect(await screen.findByTestId('feedback-pending')).toBeInTheDocument();
		expect(up()).toBeDisabled();
	});

	test('is disabled for an answer that cannot be rated', () => {
		renderComponent({ onSubmit: vi.fn(), available: false });
		expect(up()).toBeDisabled();
		expect(down()).toBeDisabled();
	});
});
