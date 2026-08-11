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
	}

	/**
	 * Row link for the thread whose id is `id`.
	 *
	 * Scoped by `href`, not by accessible name: thread ids are UUIDv7, whose first 8 hex
	 * chars are (most of) a millisecond timestamp — they only roll over about once a day,
	 * so every thread created in the same test run shares an identical shortened-id label
	 * (`threadLabel`/`shortenThreadId` in threadList.ts). Matching by visible text is
	 * therefore ambiguous; the href is exact.
	 */
	threadLink(id: string): Locator {
		return this.root.locator(`a[href="/chat/${id}"]`);
	}
}
