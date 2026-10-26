import { afterEach, describe, test, expect, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { threadLabel, type AppClient } from '@svelte-langgraph/client';
import LangGraphHost from '../__tests__/LangGraphHost.svelte';
import { makeContext, makeMockClient } from '../__tests__/testContext.js';
import ThreadList from './ThreadList.svelte';
import { aThread } from '../../__tests__/fixtures';
import * as m from '$lib/paraglide/messages.js';

const t1 = aThread({ id: 'aaaaaaaa-0000-0000-0000-000000000001', title: 'First' });
const t2 = aThread({ id: 'bbbbbbbb-0000-0000-0000-000000000002', title: 'Second' });

/** A client whose `threads.search` returns `t1`/`t2`, in the raw shape the SDK hands back. */
function clientWithThreads(threadsOverrides: Record<string, unknown> = {}): AppClient {
	const raw = [t1, t2].map((t) => ({
		thread_id: t.id,
		created_at: t.createdAt,
		updated_at: t.updatedAt,
		status: t.status,
		metadata: { title: t.title }
	}));
	return makeMockClient({
		threads: { search: vi.fn().mockResolvedValue(raw), ...threadsOverrides }
	});
}

/** Mounts a bare `ThreadList` (no props unless given) under a context wired to `client`. */
function renderUnderContext(client: AppClient | undefined, props: Record<string, unknown> = {}) {
	const ctx = makeContext({ client });
	if (client) ctx.threadList.setClient(client);
	render(LangGraphHost, { props: { ctx, component: ThreadList, ...props } });
	return ctx;
}

describe('ThreadList context defaults', () => {
	// Restore only this spy: `vi.restoreAllMocks()` would also reset the setup file's
	// `matchMedia` mock that the sidebar relies on.
	let consoleError: MockInstance | undefined;
	afterEach(() => {
		consoleError?.mockRestore();
		consoleError = undefined;
	});

	test("renders the context's thread list, as links built with the context's hrefFor", async () => {
		const ctx = renderUnderContext(clientWithThreads());
		ctx.setHrefFor((t) => `/threads/${t.id}`);

		const link = await screen.findByRole('link', { name: threadLabel(t1) });
		expect(link).toHaveAttribute('href', `/threads/${t1.id}`);
		expect(screen.getByRole('link', { name: threadLabel(t2) })).toBeInTheDocument();
	});

	test('a button row click selects the thread through the context', async () => {
		const ctx = renderUnderContext(clientWithThreads());

		await userEvent.click(await screen.findByRole('button', { name: threadLabel(t2) }));

		expect(ctx.activeThreadId).toBe(t2.id);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: threadLabel(t2) })).toHaveAttribute(
				'aria-current',
				'page'
			)
		);
	});

	test("marks the context's pending (history-loading) row", async () => {
		const ctx = renderUnderContext(clientWithThreads());
		ctx.setThreadLoading(t1.id, true);

		const row = await screen.findByRole('button', { name: threadLabel(t1) });
		await waitFor(() => expect(row).toHaveAttribute('data-pending', 'true'));
		expect(screen.getByRole('button', { name: threadLabel(t2) })).toHaveAttribute(
			'data-pending',
			'false'
		);
	});

	test('explicit activeThreadId/pendingThreadId={null} override the context', async () => {
		const ctx = renderUnderContext(clientWithThreads(), {
			activeThreadId: null,
			pendingThreadId: null
		});
		ctx.selectThread(t1.id);
		ctx.setThreadLoading(t1.id, true);

		const row = await screen.findByRole('button', { name: threadLabel(t1) });
		expect(row).not.toHaveAttribute('aria-current');
		expect(row).toHaveAttribute('data-pending', 'false');
	});

	test('disables "New chat" while the context has no client', () => {
		renderUnderContext(undefined);

		expect(screen.getByRole('button', { name: m.sidebar_new_chat() })).toBeDisabled();
	});

	test('"New chat" creates a thread through the context and selects it', async () => {
		const create = vi.fn().mockResolvedValue({ thread_id: t2.id });
		const ctx = renderUnderContext(clientWithThreads({ create }));

		await userEvent.click(screen.getByRole('button', { name: m.sidebar_new_chat() }));

		expect(create).toHaveBeenCalledOnce();
		await waitFor(() => expect(ctx.activeThreadId).toBe(t2.id));
	});

	test('shows the localized creation error, not the raw transport message', async () => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const create = vi.fn().mockRejectedValue(new Error('HTTP 400: {"detail":"boom"}'));
		renderUnderContext(clientWithThreads({ create }));

		await userEvent.click(screen.getByRole('button', { name: m.sidebar_new_chat() }));

		expect(await screen.findByRole('alert')).toHaveTextContent(m.sidebar_new_chat_error());
		expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();
	});

	test('error={null} suppresses the context-defaulted creation error', async () => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const create = vi.fn().mockRejectedValue(new Error('boom'));
		const ctx = renderUnderContext(clientWithThreads({ create }), { error: null });

		await userEvent.click(screen.getByRole('button', { name: m.sidebar_new_chat() }));

		await waitFor(() => expect(ctx.createThreadError).not.toBeNull());
		expect(screen.queryByText(m.sidebar_new_chat_error())).not.toBeInTheDocument();
	});
});
