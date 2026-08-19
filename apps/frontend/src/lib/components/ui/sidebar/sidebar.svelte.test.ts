import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChatThreadsHost from '$lib/components/ChatThreads/__tests__/ChatThreadsHost.svelte';
import type { ThreadList } from '$lib/langgraph/threadList.svelte';
import { useSidebar } from './index.js';

function makeListStub(): ThreadList {
	return {
		threads: [],
		loading: false,
		error: null,
		hasMore: false,
		refresh: () => {},
		loadMore: () => {},
		retry: () => {},
		setClient: () => {},
		setActiveThreadId: () => {}
	} as unknown as ThreadList;
}

describe('Sidebar.Root desktop collapse (SLG-104)', () => {
	// ChatThreads renders `Sidebar.Root` with `collapsible="offcanvas"` (its only usage in this
	// app), so ChatThreadsHost exercises exactly the desktop branch the `inert` fix targets.
	// jsdom's mocked `matchMedia` (vitest-setup-client.ts) always reports `matches: false`, so
	// `IsMobile` stays false and the desktop `<div data-slot="sidebar">` branch renders.
	test('the collapsed root is inert; the expanded root is not', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		const { container } = render(ChatThreadsHost, {
			props: {
				list: makeListStub(),
				onNewThread: () => {},
				onSidebar: (s: ReturnType<typeof useSidebar>) => {
					sidebar = s;
				}
			}
		});

		const root = container.querySelector('[data-slot="sidebar"]');
		expect(root).toBeInstanceOf(HTMLElement);
		// Starts open (Sidebar.Provider's default), so not inert yet.
		expect((root as HTMLElement).inert).toBe(false);

		sidebar!.setOpen(false);
		await tick();

		expect((root as HTMLElement).inert).toBe(true);

		sidebar!.setOpen(true);
		await tick();

		expect((root as HTMLElement).inert).toBe(false);
	});
});
