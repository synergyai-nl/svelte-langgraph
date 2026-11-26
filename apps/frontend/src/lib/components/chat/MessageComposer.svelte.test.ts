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

		test('displays a Send button with an accessible name', () => {
			expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
		});

		test('marks the Send icon as decorative', () => {
			expect(
				screen.getByRole('button', { name: 'Send message' }).querySelector('svg')
			).toHaveAttribute('aria-hidden', 'true');
		});
	});

	test('labels the textbox with the placeholder', () => {
		renderComposer({ placeholder: 'Ask the referee...' });

		expect(screen.getByRole('textbox', { name: 'Ask the referee...' })).toBeInTheDocument();
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

		test('shows enabled stop button with an accessible name', () => {
			renderComposer({ value: 'Hello', isStreaming: true });
			expect(screen.getByRole('button', { name: 'Stop generating' })).not.toBeDisabled();
			expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
		});

		test('calls onStop when stop button is clicked', async () => {
			const user = userEvent.setup();
			const onStop = vi.fn();
			renderComposer({ value: 'Hello', isStreaming: true, onStop });

			const button = screen.getByRole('button', { name: 'Stop generating' });
			await user.click(button);

			expect(onStop).toHaveBeenCalled();
		});
	});

	describe('when disabled is true', () => {
		test('disables the textarea and Send, and ignores a form submit', async () => {
			const onSubmit = vi.fn();
			renderComposer({ value: 'Hello', disabled: true, onSubmit });

			const textbox = screen.getByRole('textbox');
			expect(textbox).toBeDisabled();
			expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
			await fireEvent.submit(textbox.closest('form')!);

			expect(onSubmit).not.toHaveBeenCalled();
		});
	});

	test('disables submit button when input is empty', () => {
		renderComposer({ value: '' });

		expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
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

	// `ConversationApi.submit` sends any text it is given, so the composer is the one guard
	// against blank input, for the button, Enter and a plain form submit alike.
	describe('with whitespace-only input', () => {
		test('disables the submit button', () => {
			renderComposer({ value: '   ' });

			expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
		});

		test('does not call onSubmit on Enter', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn();
			renderComposer({ value: '   ', onSubmit });

			await user.click(screen.getByRole('textbox'));
			await user.keyboard('{Enter}');

			expect(onSubmit).not.toHaveBeenCalled();
		});
	});

	test('a form submit with empty input does not call onSubmit, and prevents the native submission', async () => {
		const onSubmit = vi.fn();
		const { container } = renderComposer({ value: '', onSubmit });

		const notPrevented = await fireEvent.submit(container.querySelector('form')!);

		expect(onSubmit).not.toHaveBeenCalled();
		expect(notPrevented).toBe(false);
	});

	test('a form submit while streaming does not call onSubmit', async () => {
		const onSubmit = vi.fn();
		const { container } = renderComposer({ value: 'Hello', isStreaming: true, onSubmit });

		await fireEvent.submit(container.querySelector('form')!);

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
