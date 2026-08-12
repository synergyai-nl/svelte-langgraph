import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SignInButton from './SignInButton.svelte';
import * as m from '$lib/paraglide/messages.js';

describe('SignInButton', () => {
	test('defaults its label to the shared sign-in message', () => {
		render(SignInButton);

		expect(screen.getByText(m.auth_sign_in())).toBeInTheDocument();
	});

	test('renders a caller-supplied label instead', () => {
		render(SignInButton, { label: m.auth_continue_sso() });

		expect(screen.getByText(m.auth_continue_sso())).toBeInTheDocument();
		expect(screen.queryByText(m.auth_sign_in())).not.toBeInTheDocument();
	});

	test('submits to the OIDC provider', () => {
		const { container } = render(SignInButton);

		// Auth.js posts the provider id it was configured with.
		expect(container.querySelector('input[value="oidc"]')).toBeInTheDocument();
	});

	describe('styling props', () => {
		const labelClasses = (label: string) => screen.getByText(label).className;

		test('uses the default variant and small size when unspecified', () => {
			render(SignInButton);

			const classes = labelClasses(m.auth_sign_in());
			expect(classes).toContain('bg-primary');
		});

		test('applies the outline variant used by the marketing header', () => {
			render(SignInButton, { variant: 'outline' });

			const classes = labelClasses(m.auth_sign_in());
			expect(classes).toContain('border');
			expect(classes).not.toContain('bg-primary');
		});

		test('applies the larger size used by the login modal', () => {
			render(SignInButton, { label: 'Bigger', size: 'default' });

			// The `sm` size class should not be applied at the default size.
			expect(labelClasses('Bigger')).not.toContain('h-8');
		});
	});
});
