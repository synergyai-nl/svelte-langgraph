import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { vi } from 'vitest';

import EmbeddedDemoPage from './+page.svelte';
import { m } from '$lib/paraglide/messages.js';

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
	it('offers direct authentication to a signed-out visitor', () => {
		pageState.data.session = null;
		render(EmbeddedDemoPage);

		expect(
			screen.getByRole('heading', { level: 1, name: m.demo_embedded_title() })
		).toBeInTheDocument();
		expect(screen.getByText(m.demo_embedded_description())).toBeInTheDocument();
		expect(screen.getByRole('button', { name: m.demo_embedded_sign_in() })).toBeInTheDocument();
		expect(document.querySelector('a[href="/chat"]')).toBeNull();
	});

	it('mounts the provider-wrapped surface inside the fixed card when signed in', () => {
		pageState.data.session = { accessToken: 'token-1' };
		render(EmbeddedDemoPage);

		// The real <LangGraph> mounts here; its assistant resolution fails against the fake URL
		// and lands on the embed's own error surface — the card itself is what this asserts.
		expect(screen.getByTestId('embedded-chat-card')).toBeInTheDocument();
	});
});
