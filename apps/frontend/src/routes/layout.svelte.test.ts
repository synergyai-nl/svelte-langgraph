import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';
import * as m from '$lib/paraglide/messages.js';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

// `page.url.pathname` selects the header variant; tests set it per case.
const pageState = { url: new URL('http://localhost/'), data: { session: null } };
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

// See Header.svelte.test.ts: mocking `$app/*` breaks `$app`/env resolution for
// SentryFeedbackButton's transitive imports.
vi.mock('@sentry/sveltekit', () => ({ getFeedback: () => null }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const children = createRawSnippet(() => ({
	render: () => '<p data-testid="page-content">routed content</p>'
}));

function renderLayout(pathname: string) {
	pageState.url = new URL(`http://localhost${pathname}`);
	return render(Layout, { children });
}

beforeEach(() => {
	document.body.style.pointerEvents = '';
});

describe('root layout', () => {
	test('renders routed content inside a main landmark', () => {
		renderLayout('/');

		expect(screen.getByRole('main')).toContainElement(screen.getByTestId('page-content'));
	});

	test('renders the header as a banner landmark', () => {
		renderLayout('/');

		expect(screen.getByRole('banner')).toBeInTheDocument();
	});

	test('sets the document title and description', () => {
		renderLayout('/');

		expect(document.title).toBe(m.page_title());
		expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
			'content',
			m.app_tagline()
		);
	});

	describe('header variant', () => {
		test('uses the marketing variant on "/"', () => {
			renderLayout('/');

			expect(screen.getByRole('banner')).toHaveClass('bg-transparent');
		});

		test('uses the app variant on "/chat"', () => {
			renderLayout('/chat');

			const banner = screen.getByRole('banner');
			expect(banner).not.toHaveClass('bg-transparent');
			expect(banner).toHaveClass('border-b');
		});

		test('uses the app variant on nested chat routes', () => {
			renderLayout('/chat/thread-123');

			expect(screen.getByRole('banner')).not.toHaveClass('bg-transparent');
		});
	});

	test('marks the body as started once mounted', () => {
		// E2E waits on `body.started` as its hydration signal.
		renderLayout('/');

		expect(document.body).toHaveClass('started');
	});
});
