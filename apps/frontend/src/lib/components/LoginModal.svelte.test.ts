import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LoginModal from './LoginModal.svelte';
import * as m from '$lib/paraglide/messages.js';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => goto(...args)
}));

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

		test('labels its sign-in button with the SSO message', () => {
			render(LoginModal, { open: true });

			// The modal overrides the button's default "Sign in" label.
			expect(screen.getByText(m.auth_continue_sso())).toBeInTheDocument();
			expect(screen.queryByText(m.auth_sign_in())).not.toBeInTheDocument();
		});

		test('renders the sign-in form targeting the OIDC provider', () => {
			const { baseElement } = render(LoginModal, { open: true });

			expect(baseElement.querySelector('input[value="oidc"]')).toBeInTheDocument();
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
