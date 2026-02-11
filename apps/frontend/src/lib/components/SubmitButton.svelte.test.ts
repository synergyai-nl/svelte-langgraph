import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import SubmitButton from './SubmitButton.svelte';

function renderComponent(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(SubmitButton, {
		isStreaming: false,
		disabled: false,
		...overrides
	});
}

describe('SubmitButton', () => {
	describe('when not streaming and enabled', () => {
		beforeEach(() => {
			renderComponent({ isStreaming: false, disabled: false });
		});

		test('renders the submit button', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	describe('when streaming', () => {
		beforeEach(() => {
			renderComponent({ isStreaming: true, disabled: false });
		});

		test('shows the spinner instead of send icon', () => {
			expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		});
	});

	describe('when disabled', () => {
		beforeEach(() => {
			renderComponent({ isStreaming: false, disabled: true });
		});

		test('button is disabled', () => {
			const button = screen.getByRole('button') as HTMLButtonElement;
			expect(button).toBeDisabled();
		});
	});
});
