import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import ChatInput from './ChatInput.svelte';

function renderChatInput(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatInput, {
		value: '',
		onSubmit: vi.fn(),
		...overrides
	});
}

describe('ChatInput', () => {
	describe('when rendered', () => {
		beforeEach(() => {
			renderChatInput();
		});

		test('displays a textbox', () => {
			expect(screen.getByRole('textbox')).toBeInTheDocument();
		});

		test('displays submit button', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	test('displays custom placeholder', () => {
		renderChatInput({ placeholder: 'Type something...' });

		expect(screen.getByPlaceholderText('Type something...')).toBeInTheDocument();
	});

	test('calls onSubmit on Enter', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderChatInput({ value: 'Hello', onSubmit });

		const textbox = screen.getByRole('textbox');
		await user.click(textbox);
		await user.keyboard('{Enter}');

		expect(onSubmit).toHaveBeenCalled();
	});

	test('does not call onSubmit on Shift+Enter', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderChatInput({ value: 'Hello', onSubmit });

		const textbox = screen.getByRole('textbox');
		await user.click(textbox);
		await user.keyboard('{Shift>}{Enter}{/Shift}');

		expect(onSubmit).not.toHaveBeenCalled();
	});

	describe('when isStreaming is true', () => {
		beforeEach(() => {
			renderChatInput({ value: 'Hello', isStreaming: true });
		});

		test('disables the textarea', () => {
			expect(screen.getByRole('textbox')).toBeDisabled();
		});

		test('disables the submit button', () => {
			expect(screen.getByRole('button')).toBeDisabled();
		});
	});

	test('disables submit button when input is empty', () => {
		renderChatInput({ value: '' });

		expect(screen.getByRole('button')).toBeDisabled();
	});
});
