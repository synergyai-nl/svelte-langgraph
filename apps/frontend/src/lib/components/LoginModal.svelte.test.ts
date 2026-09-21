import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import LoginModal from './LoginModal.svelte';
import * as m from '$lib/paraglide/messages.js';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => goto(...args)
}));

beforeEach(() => goto.mockReset());

afterEach(async () => {
	// The dialog's body scroll lock is restored on a 24ms timer (bits-ui
	// body-scroll-lock). Unmount and let it fire while jsdom still exists — otherwise
	// it runs after teardown and throws "document is not defined".
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('LoginModal', () => {
	describe('when open', () => {
		test('shows the title and message', () => {
			render(LoginModal, { open: true });

			expect(screen.getByText(m.login_modal_title())).toBeInTheDocument();
			expect(screen.getByText(m.login_modal_message())).toBeInTheDocument();
		});

		test('uses neutral recovery copy for rejected authentication instead of the initial invitation', () => {
			render(LoginModal, { open: true, failure: 'AUTH_REQUIRED', onretry: vi.fn() });

			expect(screen.getByText(m.auth_recovery_title())).toBeInTheDocument();
			expect(screen.getByText(m.auth_required())).toBeInTheDocument();
			expect(screen.getByRole('button', { name: m.auth_retry() })).toBeInTheDocument();
			expect(screen.getByText(m.auth_continue_sso())).toBeInTheDocument();
			expect(screen.queryByText(m.login_modal_title())).not.toBeInTheDocument();
			expect(screen.queryByText(m.login_modal_message())).not.toBeInTheDocument();
		});

		test('labels its sign-in button with the SSO message', () => {
			render(LoginModal, { open: true });

			// The modal overrides the button's default "Sign in" label.
			expect(screen.getByText(m.auth_continue_sso())).toBeInTheDocument();
			expect(screen.queryByText(m.auth_sign_in())).not.toBeInTheDocument();
		});

		test('lets the user retry authentication without navigating away', async () => {
			const onretry = vi.fn();
			render(LoginModal, { open: true, onretry, failure: 'AUTH_REFRESH_FAILED' });
			expect(screen.getByText(m.auth_refresh_failed())).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: m.auth_retry() }));
			expect(onretry).toHaveBeenCalledOnce();
			expect(goto).not.toHaveBeenCalled();
		});

		test('returns an anonymous visitor home when dismissed', async () => {
			render(LoginModal, { open: true });

			await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			expect(goto).toHaveBeenCalledWith('/');
		});

		test('keeps an auth-recovery failure on the current page when dismissed', async () => {
			render(LoginModal, { open: true, failure: 'AUTH_REQUIRED' });

			await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			expect(goto).not.toHaveBeenCalled();
		});
	});

	describe('when closed', () => {
		test('renders no dialog content', () => {
			render(LoginModal, { open: false });

			expect(screen.queryByText(m.login_modal_title())).not.toBeInTheDocument();
			expect(screen.queryByText(m.auth_continue_sso())).not.toBeInTheDocument();
		});
	});
});
