import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import ChatLayout from './+layout.svelte';
import { backendAuth } from '$lib/auth/backendToken.svelte';
import * as m from '$lib/paraglide/messages.js';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_LANGGRAPH_API_URL: 'http://localhost:9' } }));
vi.mock('$lib/auth/client', () => ({ authClient: { signIn: { social: vi.fn() } } }));

const pageState = {
	url: new URL('http://localhost/chat/t-1'),
	params: { threadID: 't-1' } as Record<string, string>,
	data: { session: null as object | null, sidebarOpen: true }
};
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	},
	navigating: { to: null }
}));

// The token never resolves: these tests are about the prompt, not requests.
vi.mock('$lib/auth/backendToken.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/auth/backendToken.svelte')>()),
	getToken: () => new Promise(() => {})
}));

import { goto } from '$app/navigation';

const children = createRawSnippet(() => ({ render: () => '<p>routed content</p>' }));

afterEach(async () => {
	backendAuth.expired = false;
	vi.mocked(goto).mockClear();
	// See LoginModal.svelte.test.ts: let bits-ui's scroll-lock timer settle before teardown.
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('chat layout sign-in prompt', () => {
	test('prompts a signed-out visitor, and closing goes home', async () => {
		pageState.data.session = null;
		render(ChatLayout, { children });

		expect(screen.getByText(m.login_modal_title())).toBeInTheDocument();
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});

	test('stays closed while signed in', () => {
		pageState.data.session = { user: {} };
		render(ChatLayout, { children });

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	test('explains an expired session, and closing keeps the page', async () => {
		pageState.data.session = { user: {} };
		render(ChatLayout, { children });

		backendAuth.expired = true;
		flushSync();

		expect(await screen.findByText(m.auth_session_expired_title())).toBeInTheDocument();
		expect(screen.getByText('routed content')).toBeInTheDocument();
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await vi.waitFor(() => expect(backendAuth.expired).toBe(false));
		expect(goto).not.toHaveBeenCalled();
	});
});
