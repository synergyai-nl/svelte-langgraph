import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { gotoFreshThread } from './fixtures/backend';

/**
 * Thread-list sidebar E2E tests (SLG-104).
 *
 * All specs authenticate as the same hardcoded `test-user` identity (see
 * fixtures/backend.ts#gotoFreshThread for the full rationale), so every test file shares
 * one pool of threads for that user. `mode: 'default'` keeps this file's tests from
 * running concurrently with each other — real-backend tests here assert that specific
 * rows are visible/active within the sidebar's first page (20 threads, sorted by
 * updated_at desc), which would be flaky if another test in this file were creating and
 * touching threads for the same user at the same moment. Absolute row counts are never
 * asserted, only presence/absence of specific ids, since other spec files still run
 * concurrently against the same shared pool.
 */
test.describe.configure({ mode: 'default' });

test.describe('Sidebar - real backend', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
	});

	test('a freshly created thread appears in the sidebar and is marked active', async ({
		page,
		sidebar
	}) => {
		const threadId = await gotoFreshThread(page);

		const row = sidebar.threadLink(threadId);
		await expect(row).toBeVisible();
		await expect(row).toHaveAttribute('aria-current', 'page');
	});

	test('sending a message does not duplicate the thread row', async ({ page, chat, sidebar }) => {
		const threadId = await gotoFreshThread(page);

		await chat.textInput.fill('alpha');
		await chat.textInput.press('Enter');
		// Input re-enabled is the "run finished" signal (house style — no fixed sleeps).
		// Generous timeout: the backend's in-memory runtime processes runs through a single
		// worker, so a run can sit queued behind other specs' runs under full-suite parallel
		// load (see e.g. phase.spec.ts's own 15s/20s timeouts for the same reason).
		await expect(chat.textInput).toBeEnabled({ timeout: 20000 });

		const row = sidebar.threadLink(threadId);
		await expect(row).toHaveCount(1);
		await expect(row).toBeVisible();
	});

	test('clicking a thread row navigates to it and updates the active row', async ({
		page,
		chat,
		sidebar
	}) => {
		const threadA = await gotoFreshThread(page);
		await chat.textInput.fill('alpha');
		await chat.textInput.press('Enter');
		// See the "sending a message" test above for why this timeout is generous.
		await expect(chat.textInput).toBeEnabled({ timeout: 20000 });

		const threadB = await gotoFreshThread(page);
		await chat.textInput.fill('beta');
		await chat.textInput.press('Enter');
		await expect(chat.textInput).toBeEnabled({ timeout: 20000 });

		await sidebar.threadLink(threadA).click();
		await page.waitForURL(`/chat/${threadA}`);

		await expect(page.getByText('alpha').first()).toBeVisible();
		await expect(sidebar.threadLink(threadA)).toHaveAttribute('aria-current', 'page');
		await expect(sidebar.threadLink(threadB)).not.toHaveAttribute('aria-current', 'page');
	});

	test('New chat creates a brand-new thread rather than reusing the idle one', async ({
		page,
		chat,
		sidebar
	}) => {
		const originalId = await gotoFreshThread(page);
		await expect(chat.textInput).toBeEnabled();

		await sidebar.newChatButton.click();
		// We start on `/chat/<originalId>`, which already matches a bare `/\/chat\/[\w-]+/`
		// pattern — waitForURL would resolve immediately without waiting for the actual
		// navigation, so the predicate must explicitly exclude the id we started on.
		await page.waitForURL((url) => {
			const id = url.pathname.split('/').at(-1);
			return !!id && id !== originalId;
		});

		const newId = new URL(page.url()).pathname.split('/').at(-1)!;
		expect(newId).not.toBe(originalId);

		// Empty state (suggestions view): no AI message cards, proving this is a genuinely
		// fresh thread and not a redirect back to the idle thread we started on.
		const aiMessage = page.getByRole('group').filter({ has: page.locator('.prose') });
		await expect(aiMessage).toHaveCount(0);
	});

	test('active row highlight survives a page reload', async ({ page, sidebar }) => {
		const threadId = await gotoFreshThread(page);
		await expect(sidebar.threadLink(threadId)).toHaveAttribute('aria-current', 'page');

		await page.reload();

		await expect(sidebar.threadLink(threadId)).toHaveAttribute('aria-current', 'page');
	});

	test('the collapsed sidebar stays collapsed across client-side navigation', async ({
		page,
		app,
		sidebar
	}) => {
		await gotoFreshThread(page);

		await sidebar.toggle.click();
		await expect(sidebar.collapsedRoot).toBeVisible();

		// Leaving `/chat` entirely unmounts chat/+layout.svelte (and its `Sidebar.Provider`), so
		// coming back is a genuine client-side remount rather than a route param change — the
		// scenario `parseSidebarCookie` exists for (that `sidebarOpen` $state initialiser reads
		// `document.cookie` fresh on every mount, since SvelteKit's root `load` only reruns on a
		// hard navigation). Both hops go through the header's plain <a> links, which SvelteKit
		// intercepts, so neither is a full reload.
		//
		// Which thread we land on is irrelevant here — `/chat` redirects to whichever thread
		// getOrCreateThread settles on, and the assertion is purely about the collapse state
		// surviving the remount.
		await app.navigateToHome();
		await page.waitForURL('/');

		await app.navigateToChat();
		await page.waitForURL(/\/chat\/[\w-]+/);

		await expect(sidebar.collapsedRoot).toBeVisible();
	});

	test('a thread created by /chat appears in the list without a reload', async ({
		page,
		sidebar
	}) => {
		// Bare `/chat` (not gotoFreshThread's `/chat/[threadID]`) exercises +page.svelte's own
		// getOrCreateThread + redirect flow (see client.ts#getOrCreateThread and
		// chat/+page.svelte#redirectToThread), which is what now nudges the sidebar via
		// `threadListRefresh.refresh()` after redirecting.
		await page.goto('/chat');
		await page.waitForURL(/\/chat\/[\w-]+/);

		const threadId = new URL(page.url()).pathname.split('/').at(-1)!;

		await expect(sidebar.threadLink(threadId)).toBeVisible();
	});
});

test.describe('Sidebar - mobile viewport', () => {
	test.beforeEach(async ({ page }) => {
		// Authenticate at the default (desktop-size) viewport, THEN shrink to mobile: the
		// header's sign-in button lives in a `hidden md:flex` block (see Header.svelte) — on
		// a narrow viewport it's only reachable through the hamburger dropdown, which
		// `authenticateUser`/`AppPage.signIn` doesn't know how to open. Resizing after
		// sign-in avoids coupling this spec to that unrelated part of the header.
		await authenticateUser(page);
		await page.setViewportSize({ width: 390, height: 844 });
	});

	test('collapses to a toggle-triggered drawer, which closes on row click', async ({
		page,
		sidebar
	}) => {
		const threadId = await gotoFreshThread(page);

		// Below the 768px mobile breakpoint, the sidebar renders as a closed Sheet — not an
		// in-flow element — so it is not visible until the toggle opens it.
		await expect(sidebar.root).not.toBeVisible();

		await sidebar.toggle.click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const row = sidebar.threadLink(threadId);
		await expect(row).toBeVisible();

		await row.click();
		await expect(dialog).not.toBeVisible();
	});

	test('New chat closes the drawer', async ({ page, sidebar }) => {
		const originalId = await gotoFreshThread(page);

		await sidebar.toggle.click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		await sidebar.newChatButton.click();

		await expect(dialog).not.toBeVisible();
		// Same predicate-based wait as the desktop "New chat creates a brand-new thread" test:
		// we start on `/chat/<originalId>`, which already matches a bare `/\/chat\/[\w-]+/`
		// pattern, so the predicate must explicitly exclude the id we started on.
		await page.waitForURL((url) => {
			const id = url.pathname.split('/').at(-1);
			return !!id && id !== originalId;
		});
	});
});

test.describe('Sidebar - mocked thread search', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
	});

	test('shows an error state with a retry button when the search request fails', async ({
		page,
		sidebar
	}) => {
		// Registered before navigation so it also intercepts the sidebar's initial fetch.
		//
		// Status 400, not 500: the LangGraph SDK's AsyncCaller retries failed requests up to
		// 4 times with exponential backoff (utils/async_caller.js), EXCEPT for a fixed list of
		// "don't retry" status codes that includes 400 but not 500. ThreadList itself also
		// retries once more without `select` on any failure (threadList.svelte.ts#search). A
		// 500 mock would make this test wait through two full backoff-retry cycles — tens of
		// seconds — before `list.error` is ever set. 400 fails fast while still exercising the
		// exact same error-handling path (any rejected search sets `list.error`).
		await page.route('**/threads/search', async (route) => {
			await route.fulfill({
				status: 400,
				contentType: 'application/json',
				body: JSON.stringify({ detail: 'boom' })
			});
		});

		await gotoFreshThread(page);

		await expect(sidebar.errorAlert).toBeVisible();
		await expect(sidebar.errorAlert).toContainText("Couldn't load your conversations.");
		await expect(sidebar.retryButton).toBeVisible();
	});

	test('shows an empty state when the user has no threads', async ({ page, sidebar }) => {
		await page.route('**/threads/search', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			});
		});

		await gotoFreshThread(page);

		await expect(sidebar.emptyMessage).toBeVisible();
	});

	test('Load more appends the second page and then disappears', async ({ page, sidebar }) => {
		// toThreadSummary (apps/frontend/src/lib/langgraph/threadList.ts) reads exactly these
		// fields off each searched thread.
		function fakeThread(n: number) {
			const id = `${n.toString().padStart(8, '0')}-fake`;
			const timestamp = new Date(Date.now() - n * 1000).toISOString();
			return {
				thread_id: id,
				created_at: timestamp,
				updated_at: timestamp,
				status: 'idle',
				metadata: {}
			};
		}

		const firstPage = Array.from({ length: 20 }, (_, i) => fakeThread(i));
		const secondPage = Array.from({ length: 5 }, (_, i) => fakeThread(1000 + i));

		await page.route('**/threads/search', async (route) => {
			const body = route.request().postDataJSON() as { offset?: number } | null;
			const offset = body?.offset ?? 0;
			const threads = offset === 0 ? firstPage : offset === 20 ? secondPage : [];
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(threads)
			});
		});

		await gotoFreshThread(page);

		const secondPageRow = sidebar.threadLink(secondPage[0].thread_id);
		await expect(sidebar.loadMoreButton).toBeVisible();
		await expect(secondPageRow).toHaveCount(0);

		await sidebar.loadMoreButton.click();

		await expect(secondPageRow).toBeVisible();
		await expect(sidebar.loadMoreButton).not.toBeVisible();
	});

	test('the active thread is shown even when it is not in the first page', async ({
		page,
		sidebar
	}) => {
		// Same field shape as the `fakeThread` in the "Load more" test above — toThreadSummary
		// (apps/frontend/src/lib/langgraph/threadList.ts) reads exactly these fields.
		function fakeThread(n: number) {
			const id = `${n.toString().padStart(8, '0')}-fake`;
			const timestamp = new Date(Date.now() - n * 1000).toISOString();
			return {
				thread_id: id,
				created_at: timestamp,
				updated_at: timestamp,
				status: 'idle',
				metadata: {}
			};
		}

		// 20 unrelated threads for the plain first-page fetch — deliberately none of them is the
		// thread `gotoFreshThread` creates below, so the active thread falls outside the loaded
		// page and ThreadList's pin-fetch (`#reconcilePin`/`#fetchPin` in threadList.svelte.ts)
		// has to kick in, firing a second `threads.search` scoped by `ids: [id]`.
		const firstPage = Array.from({ length: 20 }, (_, i) => fakeThread(i));

		await page.route('**/threads/search', async (route) => {
			const body = route.request().postDataJSON() as { ids?: string[] } | null;
			if (body?.ids && body.ids.length > 0) {
				const [id] = body.ids;
				const timestamp = new Date().toISOString();
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify([
						{
							thread_id: id,
							created_at: timestamp,
							updated_at: timestamp,
							status: 'idle',
							metadata: {}
						}
					])
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(firstPage)
			});
		});

		const targetId = await gotoFreshThread(page);

		const row = sidebar.threadLink(targetId);
		await expect(row).toBeVisible();
		await expect(row).toHaveAttribute('aria-current', 'page');
	});

	test('a failed Load more keeps the rows and shows a retry', async ({ page, sidebar }) => {
		function fakeThread(n: number) {
			const id = `${n.toString().padStart(8, '0')}-fake`;
			const timestamp = new Date(Date.now() - n * 1000).toISOString();
			return {
				thread_id: id,
				created_at: timestamp,
				updated_at: timestamp,
				status: 'idle',
				metadata: {}
			};
		}

		const firstPage = Array.from({ length: 20 }, (_, i) => fakeThread(i));

		await page.route('**/threads/search', async (route) => {
			const body = route.request().postDataJSON() as { offset?: number } | null;
			const offset = body?.offset ?? 0;
			// Anything past the first page (the `loadMore()` request, offset 20) fails; the
			// pin-fetch (`ids`-scoped, no `offset` key) and the initial page both fall through
			// to the offset-0 branch, same as the "active thread" test above.
			if (offset !== 0) {
				await route.fulfill({
					status: 400,
					contentType: 'application/json',
					body: JSON.stringify({ detail: 'boom' })
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(firstPage)
			});
		});

		await gotoFreshThread(page);

		const survivingRow = sidebar.threadLink(firstPage[0].thread_id);
		await expect(sidebar.loadMoreButton).toBeVisible();
		await expect(survivingRow).toBeVisible();

		await sidebar.loadMoreButton.click();

		await expect(sidebar.loadMoreErrorAlert).toBeVisible();
		await expect(sidebar.retryButton).toBeVisible();
		await expect(sidebar.loadMoreButton).not.toBeVisible();
		// The rows from the successful first page are untouched by the failed second page.
		await expect(survivingRow).toBeVisible();
	});
});
