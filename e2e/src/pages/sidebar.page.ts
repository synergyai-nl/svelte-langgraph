import type { Locator } from '@playwright/test';
import { AppPage } from './app.page';

/**
 * SidebarPage encapsulates the thread-list sidebar (SLG-104), rendered on the `/chat`
 * and `/chat/[threadID]` routes.
 *
 * `[data-slot="sidebar"]` is used by both the desktop sidebar and the mobile Sheet
 * drawer (see `apps/frontend/src/lib/components/ui/sidebar/sidebar.svelte`), but
 * `Sidebar.Root` renders exactly one of the two branches at a time based on viewport
 * (`IsMobile`), so a single selector scoped to that attribute works for both — there is
 * never a moment where both are simultaneously present in the DOM.
 */
export class SidebarPage {
	readonly app: AppPage;

	readonly root: Locator;
	readonly newChatButton: Locator;
	/** Lives in the chat content column, outside `[data-slot="sidebar"]` — see +layout.svelte. */
	readonly toggle: Locator;
	readonly loadMoreButton: Locator;
	readonly errorAlert: Locator;
	readonly retryButton: Locator;
	readonly emptyMessage: Locator;
	/** The `[aria-current="page"]` row — the active thread's link, when one is loaded. */
	readonly activeThread: Locator;
	/**
	 * The desktop `[data-slot="sidebar"]` element while collapsed. `collapsible="offcanvas"`
	 * never removes the element — it just shrinks the inner container to `w-0` (see
	 * sidebar.svelte) — so collapse assertions must check `data-state`, not visibility.
	 * Desktop-only: on mobile the same `[data-slot="sidebar"]` is the Sheet drawer, which
	 * doesn't carry `data-state`.
	 */
	readonly collapsedRoot: Locator;
	/**
	 * Inline `role="alert"` shown when `loadMore()` fails while rows are already loaded
	 * (ChatThreads.svelte's `{#if list.error}` branch alongside the rendered `Sidebar.Menu`).
	 * Distinct from `errorAlert`, which also matches the *initial*-load failure (list still
	 * empty) and the caller-supplied `error` prop rendered in the header (e.g. "New chat"
	 * failures) — scoping to `[data-sidebar="content"]` excludes that header alert.
	 */
	readonly loadMoreErrorAlert: Locator;

	constructor(app: AppPage) {
		this.app = app;

		this.root = app.page.locator('[data-slot="sidebar"]');

		this.newChatButton = this.root.getByRole('button', { name: 'New chat' });
		this.loadMoreButton = this.root.getByRole('button', { name: 'Load more' });
		this.errorAlert = this.root.getByRole('alert');
		this.retryButton = this.root.getByRole('button', { name: 'Try again' });
		this.emptyMessage = this.root.getByText('No conversations yet');

		this.toggle = app.page.getByRole('button', { name: 'Toggle Sidebar' });

		this.activeThread = this.root.locator('[aria-current="page"]');

		this.collapsedRoot = app.page.locator('[data-slot="sidebar"][data-state="collapsed"]');
		this.loadMoreErrorAlert = this.root.locator('[data-sidebar="content"]').getByRole('alert');
	}

	/**
	 * Row link for the thread whose id is `id`.
	 *
	 * Scoped by `href`, not by accessible name: an untitled thread's label is a formatted
	 * created-at date/time (`threadLabel` in threadList.ts), so two threads created in the
	 * same minute render identical labels by design — the href is what disambiguates them.
	 */
	threadLink(id: string): Locator {
		return this.root.locator(`a[href="/chat/${id}"]`);
	}
}
