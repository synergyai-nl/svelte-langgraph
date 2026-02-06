import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import ChatInput from './ChatInput.svelte';

describe('ChatInput', () => {
	describe('when rendered', () => {
		it('should display a textbox', () => {
			render(ChatInput, {
				props: { value: '', onSubmit: vi.fn() }
			});

			expect(screen.getByRole('textbox')).toBeInTheDocument();
		});

		it('should display submit button', () => {
			render(ChatInput, {
				props: { value: '', onSubmit: vi.fn() }
			});

			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should display custom placeholder', () => {
			render(ChatInput, {
				props: { value: '', onSubmit: vi.fn(), placeholder: 'Type something...' }
			});

			expect(screen.getByPlaceholderText('Type something...')).toBeInTheDocument();
		});
	});

	describe('when Enter is pressed', () => {
		it('should call onSubmit', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn();

			render(ChatInput, {
				props: { value: 'Hello', onSubmit }
			});

			const textbox = screen.getByRole('textbox');
			await user.click(textbox);
			await user.keyboard('{Enter}');

			expect(onSubmit).toHaveBeenCalled();
		});
	});

	describe('when Shift+Enter is pressed', () => {
		it('should not call onSubmit', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn();

			render(ChatInput, {
				props: { value: 'Hello', onSubmit }
			});

			const textbox = screen.getByRole('textbox');
			await user.click(textbox);
			await user.keyboard('{Shift>}{Enter}{/Shift}');

			expect(onSubmit).not.toHaveBeenCalled();
		});
	});

	describe('when isStreaming is true', () => {
		it('should disable the textarea', () => {
			render(ChatInput, {
				props: { value: 'Hello', isStreaming: true, onSubmit: vi.fn() }
			});

			expect(screen.getByRole('textbox')).toBeDisabled();
		});

		it('should disable the submit button', () => {
			render(ChatInput, {
				props: { value: 'Hello', isStreaming: true, onSubmit: vi.fn() }
			});

			expect(screen.getByRole('button')).toBeDisabled();
		});
	});

	describe('when input is empty', () => {
		it('should disable the submit button', () => {
			render(ChatInput, {
				props: { value: '', onSubmit: vi.fn() }
			});

			expect(screen.getByRole('button')).toBeDisabled();
		});
	});
});
