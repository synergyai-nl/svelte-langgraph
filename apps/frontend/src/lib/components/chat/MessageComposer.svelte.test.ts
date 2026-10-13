import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render';
import MessageComposer from './MessageComposer.svelte';

function renderComposer(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(MessageComposer, {
		value: '',
		onSubmit: vi.fn(),
		...overrides
	});
}

describe('MessageComposer', () => {
	describe('when rendered', () => {
		beforeEach(() => {
			renderComposer();
		});

		test('displays a textbox', () => {
			expect(screen.getByRole('textbox')).toBeInTheDocument();
		});

		test('displays submit button', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	test('displays custom placeholder', () => {
		renderComposer({ placeholder: 'Type something...' });

		expect(screen.getByPlaceholderText('Type something...')).toBeInTheDocument();
	});

	test('calls onSubmit on Enter', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderComposer({ value: 'Hello', onSubmit });

		const textbox = screen.getByRole('textbox');
		await user.click(textbox);
		await user.keyboard('{Enter}');

		expect(onSubmit).toHaveBeenCalled();
	});

	test('submitting the form calls onSubmit once and prevents the native submission', async () => {
		const onSubmit = vi.fn();
		const { container } = renderComposer({ value: 'Hello', onSubmit });

		const form = container.querySelector('form')!;
		// fireEvent returns false when preventDefault() was called on the event
		const notPrevented = await fireEvent.submit(form);

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(notPrevented).toBe(false);
	});

	test('does not call onSubmit on Shift+Enter', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderComposer({ value: 'Hello', onSubmit });

		const textbox = screen.getByRole('textbox');
		await user.click(textbox);
		await user.keyboard('{Shift>}{Enter}{/Shift}');

		expect(onSubmit).not.toHaveBeenCalled();
	});

	describe('when isStreaming is true', () => {
		test('disables the textarea', () => {
			renderComposer({ value: 'Hello', isStreaming: true });
			expect(screen.getByRole('textbox')).toBeDisabled();
		});

		test('shows enabled stop button', () => {
			renderComposer({ value: 'Hello', isStreaming: true });
			expect(screen.getByRole('button')).not.toBeDisabled();
		});

		test('calls onStop when stop button is clicked', async () => {
			const user = userEvent.setup();
			const onStop = vi.fn();
			renderComposer({ value: 'Hello', isStreaming: true, onStop });

			const button = screen.getByRole('button');
			await user.click(button);

			expect(onStop).toHaveBeenCalled();
		});
	});

	test('disables submit button when input is empty', () => {
		renderComposer({ value: '' });

		expect(screen.getByRole('button')).toBeDisabled();
	});

	test('does not call onSubmit when pressing Enter with empty input', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderComposer({ value: '', onSubmit });

		const textbox = screen.getByRole('textbox');
		await user.click(textbox);
		await user.keyboard('{Enter}');

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
