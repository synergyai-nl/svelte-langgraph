import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import LoginModal from './LoginModal.svelte';
import * as m from '$lib/paraglide/messages.js';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => goto(...args)
}));

const signIn = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('$lib/auth/client', () => ({ authClient: { signIn: { social: signIn } } }));

afterEach(async () => {
	goto.mockReset();
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

		test('labels its sign-in button with the SSO message', () => {
			render(LoginModal, { open: true });

			// The modal overrides the button's default "Sign in" label.
			expect(screen.getByText(m.auth_continue_sso())).toBeInTheDocument();
			expect(screen.queryByText(m.auth_sign_in())).not.toBeInTheDocument();
		});

		test('signs in with the OIDC provider', async () => {
			render(LoginModal, { open: true });

			await fireEvent.click(screen.getByRole('button', { name: m.auth_continue_sso() }));

			expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ provider: 'oidc' }));
		});
	});

	describe('closing', () => {
		test('goes home when signed out', async () => {
			const onclose = vi.fn();
			render(LoginModal, { open: true, onclose });

			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

			await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
			expect(goto).toHaveBeenCalledWith('/');
		});

		test('stays on the page when the session expired', async () => {
			const onclose = vi.fn();
			render(LoginModal, { open: true, expired: true, onclose });

			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

			await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
			expect(goto).not.toHaveBeenCalled();
		});
	});

	describe('when the session expired', () => {
		test('explains the expiry and offers sign-in', () => {
			render(LoginModal, { open: true, expired: true });

			expect(screen.getByText(m.auth_session_expired_title())).toBeInTheDocument();
			expect(screen.getByText(m.auth_session_expired_message())).toBeInTheDocument();
			expect(screen.queryByText(m.login_modal_title())).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: m.auth_continue_sso() })).toBeInTheDocument();
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
