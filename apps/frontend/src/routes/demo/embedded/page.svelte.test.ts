import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import EmbeddedDemoPage from './+page.svelte';
import { backendAuth, resetBackendToken } from '$lib/auth/backendToken.svelte';
import { m } from '$lib/paraglide/messages.js';

const tokenCall = vi.hoisted(() => ({
	getAccessToken: vi.fn(),
	getSession: vi.fn()
}));
vi.mock('$lib/auth/client', () => ({
	authClient: { ...tokenCall, signIn: { social: vi.fn() } }
}));

const pageState = {
	url: new URL('http://localhost/demo/embedded'),
	data: { session: null as { user: { id: string; email: string } } | null }
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
	const refused = { data: null, error: { status: 400 } };
	const granted = {
		data: { accessToken: 'tok', accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
		error: null
	};

	afterEach(() => {
		resetBackendToken();
		tokenCall.getAccessToken.mockReset();
		tokenCall.getSession.mockReset();
	});

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
		pageState.data.session = { user: { id: 'u-1', email: 'ada@example.com' } };
		render(EmbeddedDemoPage);

		// The real <LangGraph> mounts here; its assistant resolution fails against the fake URL
		// and lands on the embed's own error surface — the card itself is what this asserts.
		expect(screen.getByTestId('embedded-chat-card')).toBeInTheDocument();
	});

	it('shows the expired-session card instead of the chat when the backend credential expired', () => {
		pageState.data.session = { user: { id: 'u-1', email: 'ada@example.com' } };
		backendAuth.expired = true;
		tokenCall.getAccessToken.mockResolvedValue(refused);
		render(EmbeddedDemoPage);

		expect(screen.getByText(m.auth_session_expired_title())).toBeInTheDocument();
		expect(screen.getByText(m.auth_session_expired_message())).toBeInTheDocument();
		expect(screen.getByRole('button', { name: m.demo_embedded_sign_in() })).toBeInTheDocument();
		expect(screen.queryByTestId('embedded-chat-card')).toBeNull();
	});

	it('revalidates a stale expiry flag on mount and shows the chat when the token works again', async () => {
		pageState.data.session = { user: { id: 'u-1', email: 'ada@example.com' } };
		backendAuth.expired = true;
		tokenCall.getAccessToken.mockResolvedValue(granted);
		tokenCall.getSession.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
		render(EmbeddedDemoPage);

		expect(await screen.findByTestId('embedded-chat-card')).toBeInTheDocument();
		expect(backendAuth.expired).toBe(false);
		expect(screen.queryByText(m.auth_session_expired_title())).toBeNull();
	});

	it('keeps the expired card when revalidation on mount is refused', async () => {
		pageState.data.session = { user: { id: 'u-1', email: 'ada@example.com' } };
		backendAuth.expired = true;
		tokenCall.getAccessToken.mockResolvedValue(refused);
		render(EmbeddedDemoPage);

		await waitFor(() => expect(tokenCall.getAccessToken).toHaveBeenCalledTimes(1));
		expect(screen.getByText(m.auth_session_expired_title())).toBeInTheDocument();
		expect(screen.queryByTestId('embedded-chat-card')).toBeNull();
	});
});
