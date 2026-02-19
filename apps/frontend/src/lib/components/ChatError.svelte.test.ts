import { describe, test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from './__tests__/render';
import ChatError from './ChatError.svelte';

describe('ChatError', () => {
	const error = new Error('Something went wrong');
	error.name = 'TestError';

	beforeEach(() => {
		renderWithProviders(ChatError, { error });
	});

	test('displays the error name', () => {
		expect(screen.getByText('TestError')).toBeInTheDocument();
	});

	test('displays the error message', () => {
		expect(screen.getByText('Something went wrong')).toBeInTheDocument();
	});

	test('displays try again message', () => {
		expect(screen.getByText(/try again/i)).toBeInTheDocument();
	});

	test('displays return home link', () => {
		const link = screen.getByRole('link', { name: /return home/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute('href', '/');
	});
});
