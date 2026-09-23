import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import ThreadListHost from './__tests__/ThreadListHost.svelte';
import { aThread } from '../../__tests__/fixtures';
import { threadLabel, type ThreadSummary, type ThreadListState } from '@svelte-langgraph/client';
import { useSidebar } from '$lib/components/ui/sidebar';

// Covers ThreadListItem.svelte:18-21 (handleClick): a row click closes the mobile drawer and
// forwards the id via onSelect, mirroring the header "New chat" button's behaviour.
describe('ThreadListItem', () => {
	test('clicking a row closes the mobile drawer and calls onSelect with the thread id', async () => {
		const t1 = aThread();
		const onSelect = vi.fn();
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		const list = {
			threads: [t1],
			loading: false,
			error: null,
			hasMore: false,
			refresh: vi.fn(),
			loadMore: vi.fn(),
			setClient: vi.fn(),
			setActiveThreadId: vi.fn()
		} as unknown as ThreadListState;

		render(ThreadListHost, {
			props: {
				list,
				onNewThread: vi.fn(),
				onSelect,
				onSidebar: (s: ReturnType<typeof useSidebar>) => {
					sidebar = s;
				}
			}
		});

		// Asserting `openMobile === false` without setting it `true` first proves nothing — it
		// starts `false`.
		sidebar!.setOpenMobile(true);
		expect(sidebar!.openMobile).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: threadLabel(t1) }));

		expect(sidebar!.openMobile).toBe(false);
		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith(t1.id);
	});

	describe('pending state', () => {
		function renderRow(t1: ThreadSummary, props: Record<string, unknown>) {
			const list = {
				threads: [t1],
				loading: false,
				error: null,
				hasMore: false,
				refresh: vi.fn(),
				loadMore: vi.fn(),
				setClient: vi.fn(),
				setActiveThreadId: vi.fn()
			} as unknown as ThreadListState;

			return render(ThreadListHost, {
				props: {
					list,
					onNewThread: vi.fn(),
					hrefFor: (t: ThreadSummary) => `/threads/${t.id}`,
					...props
				}
			});
		}

		test('marks the row data-pending="true" and shows a spinner when pending and not active', () => {
			const t1 = aThread();

			renderRow(t1, { pendingThreadId: t1.id });

			const link = screen.getByRole('link', { name: threadLabel(t1) });
			expect(link).toHaveAttribute('data-pending', 'true');
			expect(link).not.toHaveAttribute('data-active', 'true');
			expect(within(link).getByRole('status', { hidden: true })).toBeInTheDocument();
		});

		test('marks the row data-pending="true" and shows a spinner when pending and active', () => {
			const t1 = aThread();

			renderRow(t1, { activeThreadId: t1.id, pendingThreadId: t1.id });

			const link = screen.getByRole('link', { name: threadLabel(t1) });
			expect(link).toHaveAttribute('data-pending', 'true');
			expect(link).toHaveAttribute('data-active', 'true');
			expect(within(link).getByRole('status', { hidden: true })).toBeInTheDocument();
		});

		test('does not render a spinner or data-pending when not pending', () => {
			const t1 = aThread();

			renderRow(t1, {});

			const link = screen.getByRole('link', { name: threadLabel(t1) });
			expect(link).toHaveAttribute('data-pending', 'false');
			expect(within(link).queryByRole('status', { hidden: true })).not.toBeInTheDocument();
		});
	});
});
