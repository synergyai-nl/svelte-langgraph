import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import LangGraphHost from '$lib/components/chat/__tests__/LangGraphHost.svelte';
import { makeContext, makeMockClient } from '$lib/components/chat/__tests__/testContext.js';
import ChatIndexPage from './+page.svelte';
import { getOrCreateThread } from '@svelte-langgraph/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

const pageState = { url: new URL('http://localhost/chat'), data: { session: { user: {} } } };
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

// Keep `ThreadListState` (used by the real `LangGraphContext`) real; only the thread fetch this
// page performs is stubbed.
vi.mock('@svelte-langgraph/client', async (importOriginal) => ({
	...(await importOriginal<typeof import('@svelte-langgraph/client')>()),
	getOrCreateThread: vi.fn()
}));

import { goto } from '$app/navigation';

beforeEach(() => {
	vi.mocked(goto).mockClear();
	vi.mocked(getOrCreateThread).mockReset();
});

describe('/chat index redirect', () => {
	it('redirects to the resolved thread and nudges the thread list', async () => {
		vi.mocked(getOrCreateThread).mockResolvedValue({ thread_id: 't-1' } as never);
		const ctx = makeContext({ client: makeMockClient() });
		const refresh = vi.spyOn(ctx.threadList, 'refresh').mockImplementation(() => {});

		render(LangGraphHost, { ctx, component: ChatIndexPage });

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/chat/t-1'));
		expect(refresh).toHaveBeenCalled();
	});

	it('drops a resolution that lands after unmount instead of navigating', async () => {
		let resolveThread!: (t: { thread_id: string }) => void;
		vi.mocked(getOrCreateThread).mockReturnValue(
			new Promise((resolve) => {
				resolveThread = resolve;
			}) as never
		);
		const ctx = makeContext({ client: makeMockClient() });
		vi.spyOn(ctx.threadList, 'refresh').mockImplementation(() => {});

		const { unmount } = render(LangGraphHost, { ctx, component: ChatIndexPage });
		await waitFor(() => expect(getOrCreateThread).toHaveBeenCalled());

		// The user navigated away (component unmounts) while the fetch was in flight — the late
		// resolution must not yank them to the stale thread.
		unmount();
		resolveThread({ thread_id: 't-stale' });
		await Promise.resolve();
		await Promise.resolve();

		expect(goto).not.toHaveBeenCalled();
	});

	it('surfaces a failed thread resolution instead of redirecting', async () => {
		vi.mocked(getOrCreateThread).mockRejectedValue(new Error('thread service down'));
		const ctx = makeContext({ client: makeMockClient() });

		render(LangGraphHost, { ctx, component: ChatIndexPage });

		expect(await screen.findByText('thread service down')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
