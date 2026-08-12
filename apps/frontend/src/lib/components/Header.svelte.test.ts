import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { renderWithProviders } from './__tests__/render';
import Header from './Header.svelte';
import * as m from '$lib/paraglide/messages.js';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => goto(...args)
}));

// Mocking `$app/*` above stops Vite resolving `$app` for transitive imports, and
// SentryFeedbackButton reaches @sentry/sveltekit (which imports `$app` internally)
// plus `$env/dynamic/public` (which reads a SvelteKit global that only exists at
// runtime). A DSN is supplied so the feedback button actually renders.
vi.mock('@sentry/sveltekit', () => ({ getFeedback: () => null }));
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SENTRY_DSN: 'https://public@sentry.invalid/1' }
}));

// `page.data.session` drives the signed-in/signed-out split; tests swap it per case.
const pageState: { data: { session: unknown } } = { data: { session: null } };
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

const session = {
	user: { name: 'Ada Lovelace', email: 'ada@example.com', image: null }
};

beforeEach(() => {
	pageState.data.session = null;
	// bits-ui locks the body while a menu is open; a test that leaves one open would
	// otherwise block pointer interaction in the next one.
	document.body.style.pointerEvents = '';
});

function renderHeader(props: Record<string, unknown> = {}) {
	return renderWithProviders(Header, props);
}

describe('Header', () => {
	describe('branding', () => {
		test('links the title back to the homepage', () => {
			renderHeader();

			expect(screen.getByRole('link', { name: new RegExp(m.app_title(), 'i') })).toHaveAttribute(
				'href',
				'/'
			);
		});

		test('shows the same lockup in both variants', () => {
			const app = renderHeader({ variant: 'app' });
			const appTitle = screen.getAllByText(m.app_title()).length;
			const appTagline = screen.getAllByText(m.app_tagline()).length;
			app.unmount();

			renderHeader({ variant: 'marketing' });

			expect(screen.getAllByText(m.app_title())).toHaveLength(appTitle);
			expect(screen.getAllByText(m.app_tagline())).toHaveLength(appTagline);
		});
	});

	describe('navigation', () => {
		// Both variants carry the same links — "/" must not become a dead end.
		(['app', 'marketing'] as const).forEach((variant) => {
			test(`exposes home, chat and docs links in the ${variant} variant`, () => {
				renderHeader({ variant });

				expect(screen.getByRole('link', { name: m.nav_home() })).toHaveAttribute('href', '/');
				expect(screen.getByRole('link', { name: m.nav_chat() })).toHaveAttribute('href', '/chat');
				expect(screen.getByRole('link', { name: m.nav_docs() })).toHaveAttribute(
					'href',
					expect.stringContaining('github.com')
				);
			});
		});

		test('opens the docs link in a new tab safely', () => {
			renderHeader();

			const docs = screen.getByRole('link', { name: m.nav_docs() });
			expect(docs).toHaveAttribute('target', '_blank');
			expect(docs).toHaveAttribute('rel', expect.stringContaining('noopener'));
		});

		test('offers a mobile menu trigger', () => {
			renderHeader();

			expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
		});

		test('navigates to chat from the mobile menu', async () => {
			const user = userEvent.setup();
			renderHeader();

			await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
			await user.click(await screen.findByRole('menuitem', { name: m.nav_chat() }));

			expect(goto).toHaveBeenCalledWith('/chat');
		});

		test('navigates home from the mobile menu', async () => {
			const user = userEvent.setup();
			renderHeader();

			await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
			await user.click(await screen.findByRole('menuitem', { name: m.nav_home() }));

			expect(goto).toHaveBeenCalledWith('/');
		});
	});

	describe('when signed out', () => {
		test('shows a sign-in button', () => {
			renderHeader();

			expect(screen.getAllByText(m.auth_sign_in()).length).toBeGreaterThan(0);
		});

		test('does not show the user menu', () => {
			renderHeader();

			expect(screen.queryByText(session.user.name)).not.toBeInTheDocument();
		});
	});

	describe('when signed in', () => {
		beforeEach(() => {
			pageState.data.session = session;
		});

		test('shows the user name in the account menu trigger', () => {
			renderHeader();

			expect(screen.getAllByText(session.user.name).length).toBeGreaterThan(0);
		});

		test('does not show a sign-in button', () => {
			renderHeader();

			expect(screen.queryByText(m.auth_sign_in())).not.toBeInTheDocument();
		});

		test('reveals sign-out and the email in the account menu', async () => {
			const user = userEvent.setup();
			renderHeader();

			await user.click(screen.getByRole('button', { name: new RegExp(session.user.name, 'i') }));

			expect(await screen.findByText(m.auth_sign_out())).toBeInTheDocument();
			expect(screen.getAllByText(session.user.email).length).toBeGreaterThan(0);
		});

		test('falls back to placeholder identity when the session has no user details', () => {
			pageState.data.session = { user: undefined };

			renderHeader();

			expect(screen.getAllByText(m.user_fallback()).length).toBeGreaterThan(0);
		});
	});

	describe('variant-specific chrome', () => {
		const feedbackButton = (container: HTMLElement) =>
			container.querySelector('.lucide-message-circle-heart');

		test('renders the feedback button in the app variant', () => {
			const { container } = renderHeader({ variant: 'app' });

			expect(feedbackButton(container)).toBeInTheDocument();
		});

		test('omits the feedback button in the marketing variant', () => {
			const { container } = renderHeader({ variant: 'marketing' });

			expect(feedbackButton(container)).not.toBeInTheDocument();
		});

		test('gives the marketing variant a transparent header', () => {
			const { container } = renderHeader({ variant: 'marketing' });

			expect(container.querySelector('header')).toHaveClass('bg-transparent');
		});

		test('gives the app variant an opaque, bordered header', () => {
			const { container } = renderHeader({ variant: 'app' });

			const header = container.querySelector('header');
			expect(header).not.toHaveClass('bg-transparent');
			expect(header).toHaveClass('border-b');
		});

		// The container must NOT differ, or the header shifts sideways when navigating
		// between "/" and "/chat".
		(['app', 'marketing'] as const).forEach((variant) => {
			test(`uses the shared container width in the ${variant} variant`, () => {
				const { container } = renderHeader({ variant });

				const inner = container.querySelector('header > div');
				expect(inner).toHaveClass('max-w-7xl');
				expect(inner).toHaveClass('px-6');
			});
		});

		test('defaults to the app variant', () => {
			const { container } = renderHeader();

			expect(container.querySelector('header')).toHaveClass('border-b');
		});
	});
});
