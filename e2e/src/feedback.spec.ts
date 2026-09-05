import type { Locator, Page, Request } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { gotoFreshThread } from './fixtures/backend';
import type { ChatPage } from './pages';

// Shares the single test-user thread pool like chat.spec — these tests submit runs
// and assert on message counts, so keep them off the fullyParallel path.
test.describe.configure({ mode: 'default' });

/** Matches the score POST, which goes straight to the backend — there is no
 *  SvelteKit hop and no signed URL to key off any more. */
const isScorePost = (req: Request) =>
	req.method() === 'POST' && /\/feedback$/.test(new URL(req.url()).pathname);

/** Record the run_id carried by every score the page posts. */
function captureScoredRuns(page: Page): string[] {
	const runIds: string[] = [];
	page.on('request', (req: Request) => {
		if (!isScorePost(req)) return;
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

/** Click a rating and resolve the comment box it opens.
 *
 *  Nothing reaches the network until the box resolves. Cancelling is the
 *  no-comment path, which is what most of these assert; passing `comment` types
 *  it in and submits, so the rating and the comment go as one request. */
async function rate(chat: ChatPage, aiMessage: Locator, which: 'up' | 'down', comment?: string) {
	await chat.feedbackButtons(aiMessage)[which].click();
	await expect(chat.feedbackDialog).toBeVisible();

	if (comment === undefined) {
		await chat.feedbackCancel.click();
	} else {
		// Typed a key at a time rather than filled: this is the only place real
		// keystrokes hit the bound textarea, since jsdom drops them under the
		// surrounding re-renders.
		await chat.feedbackComment.pressSequentially(comment);
		await chat.feedbackSubmit.click();
	}

	await expect(chat.feedbackDialog).toBeHidden();
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
	// Enabled only once the thread's stored ratings have loaded, so this also
	// covers that the load actually completes against a real backend.
	await expect(up).toBeEnabled();
	await expect(down).toBeEnabled();
});

test('rating a reply posts the score for its run, authenticated', async ({ page, chat }) => {
	const runIds = captureScoredRuns(page);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	// Awaited as a *response*: waitForRequest only proves the browser sent
	// something, so it stays green against a backend that rejects every score.
	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'up');

	const res = await scored;
	expect(res.ok()).toBe(true);
	expect(runIds).toHaveLength(1);
	expect(res.request().postDataJSON()).toEqual({ run_id: runIds[0], score: 'up' });
	// The endpoint is unauthenticated without this, and the ownership check has
	// no identity to compare against.
	expect(await res.request().headerValue('authorization')).toMatch(/^Bearer .+/);
});

test('the backend refuses an unauthenticated score, and a run the caller does not own', async ({
	page,
	chat
}) => {
	// The unit tests stub the session, so this is the only place the ownership
	// query runs against a real Postgres row written by a real run.
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'up');
	const accepted = (await scored).request();

	const url = accepted.url();
	const authorization = (await accepted.headerValue('authorization'))!;
	const ownRunId = (accepted.postDataJSON() as { run_id: string }).run_id;

	// Same token, same endpoint, a run this user never created. 404 rather than
	// 403 on purpose: the answer must not confirm that someone else's run exists.
	const foreign = await page.request.post(url, {
		headers: { Authorization: authorization },
		data: { run_id: crypto.randomUUID(), score: 'up' }
	});
	expect(foreign.status()).toBe(404);

	// The run it does own, minus the credentials. Aegra's own
	// `enable_custom_route_auth` leaves this at 200 — the route's own
	// `Depends(require_auth)` is what makes it 401.
	const anonymous = await page.request.post(url, {
		data: { run_id: ownRunId, score: 'up' }
	});
	expect(anonymous.status()).toBe(401);
});

test('rating an earlier reply scores that run, not the most recent one', async ({ page, chat }) => {
	// Regression: a per-run URL used to be minted in onFinish and stamped onto
	// every AI message that lacked one, so rating an older answer scored the newest run.
	const runIds = captureScoredRuns(page);

	await sendAndAwaitReply(chat, 'First question', 1);
	await sendAndAwaitReply(chat, 'Second question', 2);

	const older = chat.aiMessages.first();
	await older.hover();
	await rate(chat, older, 'up');
	await expect.poll(() => runIds).toHaveLength(1);
	const olderRunId = runIds[0];

	const newer = chat.aiMessages.nth(1);
	await newer.hover();
	await rate(chat, newer, 'up');
	await expect.poll(() => runIds).toHaveLength(2);

	expect(runIds[1]).not.toEqual(olderRunId);
});

test('rating still works after a reload, with no live run', async ({ page, chat }) => {
	// Regression: feedback URLs lived only in memory and were populated by onFinish,
	// so restored history had none and the buttons silently did nothing.
	await sendAndAwaitReply(chat, 'Hello', 1);

	await page.reload();
	const runIds = captureScoredRuns(page);
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'down');

	const res = await scored;
	expect(res.ok()).toBe(true);
	expect(runIds).toHaveLength(1);
	expect(res.request().postDataJSON()).toEqual({ run_id: runIds[0], score: 'down' });
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
	await rate(chat, aiMessage, 'up');
	await persisted;

	await page.reload();
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });

	// No hover here on purpose. The buttons are always in the DOM — hover only
	// animates the container's opacity — and `toHaveClass` runs no actionability
	// check. Hovering would instead race the tooltip: the virtual mouse is still
	// parked on the button from the click above, so after the reload it reopens
	// instantly and its content div swallows the pointer events.
	const restored = chat.aiMessages.first();
	await expect(chat.feedbackButtons(restored).up).toHaveClass(/bg-muted/);
	await expect(chat.feedbackButtons(restored).down).not.toHaveClass(/bg-muted/);
});

test('a comment is sent with its rating, in the same request', async ({ page, chat }) => {
	await sendAndAwaitReply(chat, 'Hello', 1);

	const scored: { score?: string; comment?: string }[] = [];
	page.on('request', (req: Request) => {
		if (isScorePost(req)) scored.push(req.postDataJSON());
	});

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	await rate(chat, aiMessage, 'down', 'lost the thread halfway');

	// One request carrying both, not a rating followed by an edit.
	await expect
		.poll(() => scored.map(({ score, comment }) => ({ score, comment })))
		.toEqual([{ score: 'down', comment: 'lost the thread halfway' }]);
});

test('cancelling the comment box still records the rating', async ({ page, chat }) => {
	// The rating is the feedback; the comment is optional. Backing out of the box
	// must not discard the thumb that opened it.
	await sendAndAwaitReply(chat, 'Hello', 1);

	// Awaited as a *response*, not a request. `waitForRequest` only proves the
	// browser sent something, and the filled-in thumb it would then assert on is
	// the optimistic write from the click — both are already true when the server
	// rejects the score, so that pairing stays green against a backend that
	// records nothing.
	const scored = page.waitForResponse((res) => isScorePost(res.request()));

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	await chat.feedbackButtons(aiMessage).up.click();
	await expect(chat.feedbackDialog).toBeVisible();
	await chat.feedbackCancel.click();

	const res = await scored;
	expect(res.request().postDataJSON()).toMatchObject({ score: 'up' });
	expect(res.ok()).toBe(true);

	// Survives the round trip: the rollback runs on failure, so a thumb still
	// filled after the response — and no failure marker — is the real evidence.
	await expect(chat.feedbackButtons(aiMessage).up).toHaveClass(/bg-muted/);
	await expect(aiMessage.getByTestId('feedback-failed')).toHaveCount(0);
});
