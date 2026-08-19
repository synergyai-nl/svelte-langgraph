import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import ChatThreadsHost from './__tests__/ChatThreadsHost.svelte';
import { aThread } from '../__tests__/fixtures';
import { threadLabel, type ThreadSummary } from '$lib/langgraph/threadList';
import type { ThreadList } from '$lib/langgraph/threadList.svelte';
import { useSidebar } from '$lib/components/ui/sidebar';

interface ListStubOverrides {
	threads?: ThreadSummary[];
	loading?: boolean;
	error?: Error | null;
	hasMore?: boolean;
	refresh?: () => void;
	loadMore?: () => void;
	retry?: () => void;
}

function makeListStub(overrides: ListStubOverrides = {}): ThreadList {
	return {
		threads: overrides.threads ?? [],
		loading: overrides.loading ?? false,
		error: overrides.error ?? null,
		hasMore: overrides.hasMore ?? false,
		refresh: overrides.refresh ?? vi.fn(),
		loadMore: overrides.loadMore ?? vi.fn(),
		retry: overrides.retry ?? vi.fn(),
		setClient: vi.fn(),
		setActiveThreadId: vi.fn()
	} as unknown as ThreadList;
}

function renderComponent(props: Record<string, unknown> = {}) {
	return render(ChatThreadsHost, {
		props: {
			list: makeListStub(),
			onNewThread: vi.fn(),
			...props
		}
	});
}

describe('ChatThreads', () => {
	describe('rows', () => {
		test('renders a link per thread with hrefFor and threadLabel as accessible name', () => {
			const t1 = aThread({ id: 'thread-00000000-0000-0000-0000-000000000001', title: null });
			const t2 = aThread({
				id: 'thread-00000000-0000-0000-0000-000000000002',
				title: 'Planning trip'
			});

			renderComponent({
				list: makeListStub({ threads: [t1, t2] }),
				hrefFor: (t: ThreadSummary) => `/threads/${t.id}`
			});

			const link1 = screen.getByRole('link', { name: threadLabel(t1) });
			const link2 = screen.getByRole('link', { name: threadLabel(t2) });
			expect(link1).toHaveAttribute('href', `/threads/${t1.id}`);
			expect(link2).toHaveAttribute('href', `/threads/${t2.id}`);
		});

		test('renders buttons instead of links when hrefFor is not given', () => {
			const t1 = aThread();
			renderComponent({ list: makeListStub({ threads: [t1] }) });

			expect(screen.getByRole('button', { name: threadLabel(t1) })).toBeInTheDocument();
			expect(screen.queryByRole('link', { name: threadLabel(t1) })).not.toBeInTheDocument();
		});

		test('marks only the active row with aria-current="page"', () => {
			const t1 = aThread({ id: 'aaaaaaaa-0000-0000-0000-000000000001' });
			const t2 = aThread({ id: 'bbbbbbbb-0000-0000-0000-000000000002' });

			renderComponent({
				list: makeListStub({ threads: [t1, t2] }),
				activeThreadId: t2.id,
				hrefFor: (t: ThreadSummary) => `/threads/${t.id}`
			});

			const link1 = screen.getByRole('link', { name: threadLabel(t1) });
			const link2 = screen.getByRole('link', { name: threadLabel(t2) });
			expect(link1).not.toHaveAttribute('aria-current');
			expect(link2).toHaveAttribute('aria-current', 'page');
		});

		test('marks only the row matching pendingThreadId with data-pending="true"', () => {
			const t1 = aThread({ id: 'aaaaaaaa-0000-0000-0000-000000000001' });
			const t2 = aThread({ id: 'bbbbbbbb-0000-0000-0000-000000000002' });

			renderComponent({
				list: makeListStub({ threads: [t1, t2] }),
				pendingThreadId: t2.id,
				hrefFor: (t: ThreadSummary) => `/threads/${t.id}`
			});

			const link1 = screen.getByRole('link', { name: threadLabel(t1) });
			const link2 = screen.getByRole('link', { name: threadLabel(t2) });
			expect(link1).toHaveAttribute('data-pending', 'false');
			expect(link2).toHaveAttribute('data-pending', 'true');
		});
	});

	describe('new chat', () => {
		test('clicking calls onNewThread', async () => {
			const onNewThread = vi.fn();
			renderComponent({ onNewThread });

			await fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

			expect(onNewThread).toHaveBeenCalledOnce();
		});

		test('is disabled when disabled prop is set', () => {
			renderComponent({ disabled: true });

			expect(screen.getByRole('button', { name: /new chat/i })).toBeDisabled();
		});

		test('is disabled when busy prop is set', () => {
			renderComponent({ busy: true });

			expect(screen.getByRole('button', { name: /new chat/i })).toBeDisabled();
		});

		test('closes the mobile drawer', async () => {
			let sidebar: ReturnType<typeof useSidebar> | null = null;
			const onNewThread = vi.fn();

			renderComponent({
				onNewThread,
				onSidebar: (s: ReturnType<typeof useSidebar>) => {
					sidebar = s;
				}
			});

			// Asserting `openMobile === false` without setting it `true` first proves nothing — it
			// starts `false`.
			sidebar!.setOpenMobile(true);
			expect(sidebar!.openMobile).toBe(true);

			await fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

			expect(sidebar!.openMobile).toBe(false);
			expect(onNewThread).toHaveBeenCalledOnce();
		});

		test('keeps the mobile drawer open when creation fails, so the error stays visible', async () => {
			let sidebar: ReturnType<typeof useSidebar> | null = null;
			// The layout's handler resolves false on failure; on mobile this panel *is* the Sheet,
			// so closing it would hide the `error` it renders.
			const onNewThread = vi.fn().mockResolvedValue(false);

			renderComponent({
				onNewThread,
				onSidebar: (s: ReturnType<typeof useSidebar>) => {
					sidebar = s;
				}
			});

			sidebar!.setOpenMobile(true);

			await fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
			await tick();

			expect(onNewThread).toHaveBeenCalledOnce();
			expect(sidebar!.openMobile).toBe(true);
		});
	});

	describe('loading state', () => {
		test('shows skeletons only when loading and the list is empty', () => {
			renderComponent({ list: makeListStub({ loading: true, threads: [] }) });

			expect(screen.getByText(/loading conversations/i)).toBeInTheDocument();
		});

		test('keeps existing rows and shows no skeletons when loading with rows already present', () => {
			const t1 = aThread();
			renderComponent({ list: makeListStub({ loading: true, threads: [t1] }) });

			expect(screen.getByRole('button', { name: threadLabel(t1) })).toBeInTheDocument();
			expect(screen.queryByText(/loading conversations/i)).not.toBeInTheDocument();
		});
	});

	describe('empty state', () => {
		test('shows the empty message when settled with no threads', () => {
			renderComponent({ list: makeListStub({ loading: false, threads: [] }) });

			expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
		});
	});

	describe('error state', () => {
		test('shows an alert with a retry button that calls retry when there are no rows', async () => {
			const retry = vi.fn();
			renderComponent({
				list: makeListStub({ error: new Error('boom'), threads: [], retry })
			});

			const alert = screen.getByRole('alert');
			expect(alert).toHaveTextContent(/couldn't load your conversations/i);

			await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

			expect(retry).toHaveBeenCalledOnce();
		});

		test('keeps existing rows and shows an inline alert with a retry that replays the failed request', async () => {
			const t1 = aThread();
			const retry = vi.fn();
			const loadMore = vi.fn();
			renderComponent({
				list: makeListStub({ error: new Error('boom'), threads: [t1], retry, loadMore })
			});

			expect(screen.getByRole('button', { name: threadLabel(t1) })).toBeInTheDocument();

			const alert = screen.getByRole('alert');
			expect(alert).toHaveTextContent(/couldn't load your conversations/i);

			await fireEvent.click(within(alert).getByRole('button', { name: /try again/i }));

			// retry(), not loadMore(): the failure may have been a refresh, which loadMore() cannot
			// recover — it would no-op or re-append offset 0 behind the stale rows.
			expect(retry).toHaveBeenCalledOnce();
			expect(loadMore).not.toHaveBeenCalled();
		});

		test('disables the inline retry button while a request is in flight', () => {
			const t1 = aThread();
			renderComponent({
				list: makeListStub({ error: new Error('boom'), threads: [t1], loading: true })
			});

			const alert = screen.getByRole('alert');
			expect(within(alert).getByRole('button', { name: /try again/i })).toBeDisabled();
		});

		test('renders the caller-supplied error prop as an inline alert', () => {
			renderComponent({ error: "Couldn't start a new chat." });

			expect(screen.getByRole('alert')).toHaveTextContent("Couldn't start a new chat.");
		});

		test('does not render a caller error alert when the prop is unset', () => {
			renderComponent({});

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});
	});

	describe('load more', () => {
		test('shows a load more button when hasMore, calling loadMore on click', async () => {
			const loadMore = vi.fn();
			const t1 = aThread();
			renderComponent({ list: makeListStub({ threads: [t1], hasMore: true, loadMore }) });

			await fireEvent.click(screen.getByRole('button', { name: /load more/i }));

			expect(loadMore).toHaveBeenCalledOnce();
		});

		test('is absent when there is no more to load', () => {
			const t1 = aThread();
			renderComponent({ list: makeListStub({ threads: [t1], hasMore: false }) });

			expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
		});

		test('is disabled while a request is in flight', () => {
			const t1 = aThread();
			renderComponent({ list: makeListStub({ threads: [t1], hasMore: true, loading: true }) });

			expect(screen.getByRole('button', { name: /load more/i })).toBeDisabled();
		});
	});

	describe('item snippet override', () => {
		test('renders custom content per row instead of the default row', () => {
			const t1 = aThread({ id: 'thread-00000000-0000-0000-0000-000000000001' });

			const item = createRawSnippet<[ThreadSummary]>((getThread) => ({
				render: () => `<div data-testid="custom-row">Custom: ${getThread().id}</div>`
			}));

			renderComponent({ list: makeListStub({ threads: [t1] }), item });

			expect(screen.getByTestId('custom-row')).toHaveTextContent(`Custom: ${t1.id}`);
			expect(screen.queryByRole('button', { name: threadLabel(t1) })).not.toBeInTheDocument();
		});
	});

	describe('labels override', () => {
		test('overrides rendered text', () => {
			renderComponent({ labels: { newChat: 'Start a conversation' } });

			expect(screen.getByRole('button', { name: 'Start a conversation' })).toBeInTheDocument();
		});
	});
});
