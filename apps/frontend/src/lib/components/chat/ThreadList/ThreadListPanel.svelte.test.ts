import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { ThreadListState } from '@svelte-langgraph/client';
import type { useSidebar } from '$lib/components/ui/sidebar';
import LangGraphHost from '../__tests__/LangGraphHost.svelte';
import ThreadListHost from './__tests__/ThreadListHost.svelte';
import ThreadList from './ThreadList.svelte';

const list = {
	threads: [],
	loading: false,
	error: null,
	hasMore: false,
	refresh: () => {},
	loadMore: () => {},
	retry: () => {},
	setClient: () => {},
	setActiveThreadId: () => {}
} as unknown as ThreadListState;

describe('ThreadListPanel', () => {
	test('throws, naming the missing provider, outside a Sidebar.Provider', () => {
		// LangGraphHost supplies the `<LangGraph>` context but, like `<LangGraph>`, no sidebar.
		expect(() =>
			render(LangGraphHost, { props: { component: ThreadList, list, onNewThread: () => {} } })
		).toThrow(/<ThreadList> must be rendered inside <Sidebar.Provider>/);
	});

	// jsdom's mocked `matchMedia` (vitest-setup-client.ts) always reports `matches: false`, so
	// `IsMobile` stays false and the desktop `<div data-slot="sidebar">` branch renders.
	test('the collapsed panel is inert; the expanded panel is not', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		const { container } = render(ThreadListHost, {
			props: {
				list,
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
