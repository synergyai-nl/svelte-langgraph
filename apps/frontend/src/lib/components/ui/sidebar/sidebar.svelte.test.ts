import { describe, test, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ThreadListHost from '$lib/components/chat/ThreadList/__tests__/ThreadListHost.svelte';
import ProviderHost from './__tests__/ProviderHost.svelte';
import type { ThreadListState } from '@svelte-langgraph/client';
import { useSidebar } from './index.js';
import { SIDEBAR_COOKIE_NAME } from './constants.js';

function makeListStub(): ThreadListState {
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
	} as unknown as ThreadListState;
}

describe('Sidebar.Root desktop collapse (SLG-104)', () => {
	// ThreadList renders `Sidebar.Root` with `collapsible="offcanvas"` (its only usage in this
	// app), so ThreadListHost exercises exactly the desktop branch the `inert` fix targets.
	// jsdom's mocked `matchMedia` (vitest-setup-client.ts) always reports `matches: false`, so
	// `IsMobile` stays false and the desktop `<div data-slot="sidebar">` branch renders.
	test('the collapsed root is inert; the expanded root is not', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		const { container } = render(ThreadListHost, {
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

describe('Sidebar.Provider global side effects gated on a registered Root (SLG-133)', () => {
	beforeEach(() => {
		// Clear the cookie between tests so a write from one test can't leak into the next.
		document.cookie = `${SIDEBAR_COOKIE_NAME}=; path=/; max-age=0`;
	});

	test('with no mounted Root, toggling open does not write the persistence cookie', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		render(ProviderHost, {
			props: { withRoot: false, onSidebar: (s: ReturnType<typeof useSidebar>) => (sidebar = s) }
		});

		sidebar!.setOpen(false);
		await tick();

		expect(document.cookie).not.toContain(SIDEBAR_COOKIE_NAME);
	});

	test('with no mounted Root, the "b" shortcut does not toggle open', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		render(ProviderHost, {
			props: { withRoot: false, onSidebar: (s: ReturnType<typeof useSidebar>) => (sidebar = s) }
		});

		const before = sidebar!.open;
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
		await tick();

		expect(sidebar!.open).toBe(before);
	});

	test('with a mounted Root, toggling open writes the persistence cookie', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		render(ProviderHost, {
			props: { withRoot: true, onSidebar: (s: ReturnType<typeof useSidebar>) => (sidebar = s) }
		});

		sidebar!.setOpen(false);
		await tick();

		expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=false`);
	});

	test('with a mounted Root, the "b" shortcut toggles open', async () => {
		let sidebar: ReturnType<typeof useSidebar> | null = null;

		render(ProviderHost, {
			props: { withRoot: true, onSidebar: (s: ReturnType<typeof useSidebar>) => (sidebar = s) }
		});

		const before = sidebar!.open;
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
		await tick();

		expect(sidebar!.open).toBe(!before);
	});
});
