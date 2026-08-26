import type { Page, Request } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { gotoFreshThread } from './fixtures/backend';
import type { ChatPage } from './pages';

// Shares the single test-user thread pool like chat.spec — these tests submit runs
// and assert on message counts, so keep them off the fullyParallel path.
test.describe.configure({ mode: 'default' });

/** Record the run_id of every /api/feedback/token request the page makes. */
function captureTokenRequests(page: Page): string[] {
	const runIds: string[] = [];
	page.on('request', (req: Request) => {
		if (req.method() !== 'POST') return;
		if (!req.url().includes('/api/feedback/token')) return;
		const body = req.postDataJSON() as { run_id?: string } | null;
		if (body?.run_id) runIds.push(body.run_id);
	});
	return runIds;
}

/** Send `text` and wait until `expectedCount` AI replies have rendered. */
async function sendAndAwaitReply(chat: ChatPage, text: string, expectedCount: number) {
	await chat.textInput.fill(text);
	await chat.textInput.press('Enter');
	await expect(chat.aiMessages).toHaveCount(expectedCount, { timeout: 30_000 });
	await expect(chat.aiMessages.nth(expectedCount - 1)).not.toBeEmpty();
}

test.beforeEach(async ({ page }) => {
	await authenticateUser(page);
	await gotoFreshThread(page);
});

test('rating buttons are enabled on an AI message', async ({ chat }) => {
	// Regression guard: these shipped disabled behind a "coming soon" tooltip
	// before the feature landed, which makes the whole flow unreachable.
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	const { up, down } = chat.feedbackButtons(aiMessage);

	await expect(up).toBeVisible();
	await expect(down).toBeVisible();
	await expect(up).toBeEnabled();
	await expect(down).toBeEnabled();
});

test('rating a reply mints a token for its run and posts the score', async ({ page, chat }) => {
	const runIds = captureTokenRequests(page);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	const scorePost = page.waitForRequest(
		(req) => req.method() === 'POST' && /\/api\/feedback\?token=/.test(req.url())
	);
	await chat.feedbackButtons(aiMessage).up.click();

	const req = await scorePost;
	expect(req.postDataJSON()).toEqual({ score: 1 });
	expect(runIds).toHaveLength(1);
});

test('rating an earlier reply scores that run, not the most recent one', async ({ page, chat }) => {
	// Regression: the token used to be minted per-run in onFinish and stamped onto
	// every AI message that lacked one, so rating an older answer scored the newest run.
	const runIds = captureTokenRequests(page);

	await sendAndAwaitReply(chat, 'First question', 1);
	await sendAndAwaitReply(chat, 'Second question', 2);

	const older = chat.aiMessages.first();
	await older.hover();
	await chat.feedbackButtons(older).up.click();
	await expect.poll(() => runIds).toHaveLength(1);
	const olderRunId = runIds[0];

	const newer = chat.aiMessages.nth(1);
	await newer.hover();
	await chat.feedbackButtons(newer).up.click();
	await expect.poll(() => runIds).toHaveLength(2);

	expect(runIds[1]).not.toEqual(olderRunId);
});

test('rating still works after a reload, with no live run', async ({ page, chat }) => {
	// Regression: feedback URLs lived only in memory and were populated by onFinish,
	// so restored history had none and the buttons silently did nothing.
	await sendAndAwaitReply(chat, 'Hello', 1);

	await page.reload();
	const runIds = captureTokenRequests(page);
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	const scorePost = page.waitForRequest(
		(req) => req.method() === 'POST' && /\/api\/feedback\?token=/.test(req.url())
	);
	await chat.feedbackButtons(aiMessage).down.click();

	const req = await scorePost;
	expect(req.postDataJSON()).toEqual({ score: 0 });
	expect(runIds).toHaveLength(1);
});

test('a rating is still shown after a reload', async ({ page, chat }) => {
	// The rating is mirrored into thread metadata precisely so it can be read
	// back here. Langfuse can't serve it: no batch-by-thread query, and a fresh
	// score takes ~10s to become readable.
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	const persisted = page.waitForRequest(
		(req) => req.method() === 'PATCH' && /\/threads\//.test(req.url())
	);
	await chat.feedbackButtons(aiMessage).up.click();
	await persisted;

	await page.reload();
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });

	const restored = chat.aiMessages.first();
	await restored.hover();
	await expect(chat.feedbackButtons(restored).up).toHaveClass(/bg-muted/);
	await expect(chat.feedbackButtons(restored).down).not.toHaveClass(/bg-muted/);
});
