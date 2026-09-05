import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { vi } from 'vitest';

import EmbeddedDemoPage from './+page.svelte';

const pageState = {
	url: new URL('http://localhost/demo/embedded'),
	data: { session: null as { accessToken?: string } | null }
};
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_LANGGRAPH_API_URL: 'http://localhost:9' }
}));

describe('/demo/embedded', () => {
	it('asks a signed-out visitor to sign in, linking to /chat', () => {
		pageState.data.session = null;
		render(EmbeddedDemoPage);

		expect(screen.getByText('Sign in to try the embedded chat demo.')).toBeInTheDocument();
		// /chat is the route that opens the login modal; the landing page has no sign-in UI.
		expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/chat');
	});

	it('mounts the provider-wrapped surface inside the fixed card when signed in', () => {
		pageState.data.session = { accessToken: 'token-1' };
		render(EmbeddedDemoPage);

		// The real <LangGraph> mounts here; its assistant resolution fails against the fake URL
		// and lands on the embed's own error surface — the card itself is what this asserts.
		expect(screen.getByTestId('embedded-chat-card')).toBeInTheDocument();
	});
});
