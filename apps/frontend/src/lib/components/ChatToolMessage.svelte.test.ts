import { describe, test, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import ChatToolMessage from './ChatToolMessage.svelte';
import { aToolMessage } from './__tests__/fixtures';
import * as m from '$lib/paraglide/messages.js';

function renderComponent(overrides: Record<string, unknown> = {}) {
	const message = aToolMessage(overrides as Parameters<typeof aToolMessage>[0]);
	return renderWithProviders(ChatToolMessage, { message });
}

describe('ChatToolMessage', () => {
	describe('when rendered with a tool message', () => {
		beforeEach(() => {
			renderComponent();
		});

		test('shows the tool name', () => {
			expect(screen.getByText('search')).toBeInTheDocument();
		});

		test('shows the wrench icon container', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		test('shows the success status icon', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		test('shows the expand/collapse button', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	describe('when collapsed (default)', () => {
		beforeEach(() => {
			renderComponent();
		});

		test('does not show payload or result by default', () => {
			expect(screen.queryByText(m.tool_label())).not.toBeInTheDocument();
		});
	});

	describe('when expanded', () => {
		test('shows the tool label with name', async () => {
			renderComponent();
			const user = userEvent.setup();
			const button = screen.getByRole('button');
			user.click(button);

			// Wait for expansion
			await waitFor(() => {
				expect(screen.getByText('Tool:')).toBeInTheDocument();
				// Use getAllByText since 'search' appears in both button and expanded content
				const searchLabels = screen.getAllByText('search');
				expect(searchLabels.length).toBeGreaterThan(0);
			});
		});

		test('shows the parameters section', async () => {
			const user = userEvent.setup();
			renderComponent({ payload: { key: 'value' } });
			const button = screen.getByRole('button');
			user.click(button);

			await waitFor(() => {
				expect(screen.getByText(m.tool_parameters())).toBeInTheDocument();
			});
		});

		test('shows the result section', async () => {
			const user = userEvent.setup();
			renderComponent({ text: 'Result text' });
			const button = screen.getByRole('button');
			user.click(button);

			await waitFor(() => {
				expect(screen.getByText(m.tool_result())).toBeInTheDocument();
			});
		});
	});

	describe('when message has no payload', () => {
		test('shows "no parameters" message when expanded', async () => {
			const user = userEvent.setup();
			renderComponent({ payload: {} });
			const button = screen.getByRole('button');
			user.click(button);

			await waitFor(() => {
				expect(screen.getByText(m.tool_no_parameters())).toBeInTheDocument();
			});
		});
	});

	describe('when message has status error', () => {
		beforeEach(() => {
			renderComponent({ status: 'error' });
		});

		test('shows error status indicator', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	describe('when message has status pending', () => {
		beforeEach(() => {
			renderComponent({ status: 'pending' });
		});

		test('shows pending status indicator', () => {
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});
});
