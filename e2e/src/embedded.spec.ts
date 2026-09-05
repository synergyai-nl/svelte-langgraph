import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';

/**
 * `/demo/embedded` (SLG-133 PR 4) — proves the container-agnostic story: `<LangGraph>` +
 * `<ChatSurface>` work with no `<ThreadList>`, no router wiring, and no app chrome, mounted
 * inside an arbitrarily small host container instead of the full-page `/chat` layout.
 *
 * One worker for the whole suite (see playwright.config.ts), so no cross-test thread races to
 * worry about here — but this test still gets its own fresh browser context (default `page`
 * fixture behaviour), so cookies asserted absent below can't have leaked in from another spec.
 */
test('embedded chat surface has no sidebar, round-trips a message, and stays scoped to its own container', async ({
	page
}) => {
	// Generous headroom for first-token latency against a freshly-started backend (same
	// rationale as chat.spec.ts's streaming test) — this spec runs on its own, so this is likely
	// the very first request the mocked backend ever serves in the run.
	test.setTimeout(60_000);

	await authenticateUser(page);
	await page.goto('/demo/embedded');

	const card = page.locator('[data-testid="embedded-chat-card"]');
	await expect(card).toBeVisible();

	// (a) No sidebar chrome anywhere on the page — the whole point of the embed.
	await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);

	// (c) `b` is the app's sidebar-toggle shortcut. `Sidebar.Provider` gates both its global
	// keydown handler and its cookie write on a mounted `Sidebar.Root` (SLG-133's embeddable-API
	// patch — see `sidebar/context.svelte.ts`'s `hasRegisteredRoot`); this page renders none, so
	// the shortcut must be a complete no-op here.
	await page.keyboard.press('Control+b');
	await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
	expect((await page.context().cookies()).find((c) => c.name === 'sidebar_state')).toBeUndefined();

	// (b) Sending a message round-trips through the real (mocked-AI) backend. Many
	// space-separated words (not one long unbroken token, which wouldn't wrap and so wouldn't
	// grow the container's height) so the echoed AI bubble alone overflows the card's small fixed
	// height — needed for the scroll check in (d) below to be a meaningful, non-vacuous assertion.
	const textInput = card.getByRole('textbox', { name: 'Ask your agent…' });
	const question = Array.from({ length: 36 }, () => randomUUID().slice(0, 8)).join(' ');
	await textInput.fill(question);
	await textInput.press('Enter');

	// `has:` locators are matched against the whole page, then checked for descendance from the
	// candidate — building the inner locator from `card` too would require a *second*
	// `[data-testid="embedded-chat-card"]` nested inside each group, which doesn't exist and
	// silently zeroes the match. `page.locator('.prose')` here, scoped down by the outer
	// `card.getByRole('group')` — same split chat.spec.ts uses for its own `.prose` filter.
	const aiMessage = card
		.getByRole('group')
		.filter({ has: page.locator('.prose') })
		.first();
	await expect(aiMessage).toBeVisible({ timeout: 30_000 });
	await expect(aiMessage).not.toBeEmpty();
	await expect(textInput).toBeEnabled({ timeout: 30_000 });

	// (d) The message list scrolls WITHIN the card, not the page. The app's own <main> is the
	// single outer viewport-height reference (see routes/+layout.svelte and thinking.spec.ts's
	// same check) and must never need to scroll; the card's small fixed height (h-[32rem]), on
	// the other hand, is easily outgrown by the question + streamed echo, so its own message-list
	// container (`div.overflow-y-auto`, tag-scoped to skip the composer's auto-resize textarea —
	// same rationale as thinking.spec.ts) must.
	await expect
		.poll(() => page.locator('main').evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
		.toBe(true);
	const innerScroll = card.locator('div.overflow-y-auto').first();
	await expect
		.poll(() => innerScroll.evaluate((el) => el.scrollHeight > el.clientHeight))
		.toBe(true);

	// Still no sidebar cookie after a full round trip.
	expect((await page.context().cookies()).find((c) => c.name === 'sidebar_state')).toBeUndefined();
});
