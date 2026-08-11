import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ChatThreadsHost from './__tests__/ChatThreadsHost.svelte';
import { aThread } from '../__tests__/fixtures';
import { threadLabel } from '$lib/langgraph/threadList';
import type { ThreadList } from '$lib/langgraph/threadList.svelte';
import { useSidebar } from '$lib/components/ui/sidebar';

// Covers ChatThreadItem.svelte:18-21 (handleClick): a row click closes the mobile drawer and
// forwards the id via onSelect, mirroring the header "New chat" button's behaviour.
describe('ChatThreadItem', () => {
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
		} as unknown as ThreadList;

		render(ChatThreadsHost, {
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
});
