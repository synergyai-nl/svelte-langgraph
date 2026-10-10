import type { Locator, Page, Request } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { OIDC_CONFIG } from './pages';
import { gotoFreshThread, LANGGRAPH_CONFIG } from './fixtures/backend';
import { AppPage, ChatPage } from './pages';

// Shares the single test-user thread pool like chat.spec — these tests submit runs
// and assert on message counts, so keep them off the fullyParallel path.
test.describe.configure({ mode: 'default' });

/** Matches the score POST, which goes straight to the backend — there is no
 *  SvelteKit hop and no signed URL to key off any more. */
const isScorePost = (req: Request) =>
	req.method() === 'POST' && /\/feedback$/.test(new URL(req.url()).pathname);

type ScoreBody = { thread_id: string; message_id: string; score: string; comment?: string };

/** Record the body of every score the page posts. */
function captureScores(page: Page): ScoreBody[] {
	const bodies: ScoreBody[] = [];
	page.on('request', (req: Request) => {
		if (isScorePost(req)) bodies.push(req.postDataJSON() as ScoreBody);
	});
	return bodies;
}

/** The bearer token the page sends to the backend, once it has sent one. */
function captureToken(page: Page): () => string | undefined {
	let token: string | undefined;
	page.on('request', (req: Request) => {
		if (!req.url().startsWith(LANGGRAPH_CONFIG.apiUrl)) return;
		token ??= req.headers()['authorization'];
	});
	return () => token;
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
	// Enabled only once the answer carries the run the backend stamped on it,
	// so this also covers the stamp surviving a real run into thread state.
	await expect(up).toBeEnabled();
	await expect(down).toBeEnabled();
});

test('rating a reply posts the score for that message, authenticated', async ({ page, chat }) => {
	const bodies = captureScores(page);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();

	// Awaited as a *response*: waitForRequest only proves the browser sent
	// something, so it stays green against a backend that rejects every score.
	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'up');

	const res = await scored;
	expect(res.ok()).toBe(true);
	expect(bodies).toHaveLength(1);
	expect(Object.keys(bodies[0]).sort()).toEqual(['message_id', 'score', 'thread_id']);
	expect(bodies[0]).toMatchObject({ score: 'up' });
	// Without this the endpoint is unauthenticated, and Aegra has no caller to
	// authorize the thread read as.
	expect(await res.request().headerValue('authorization')).toMatch(/^Bearer .+/);
});

/** Rate a reply on an already signed-in page, and report the message that was
 *  scored plus the credentials it was scored with. */
async function scoreOwnReply(page: Page, chat: ChatPage) {
	await gotoFreshThread(page);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'up');
	const request = (await scored).request();

	const body = request.postDataJSON() as ScoreBody;
	return {
		url: request.url(),
		authorization: (await request.headerValue('authorization'))!,
		threadId: body.thread_id,
		messageId: body.message_id
	};
}

test("the backend refuses an unauthenticated score, and one on someone else's thread", async ({
	page,
	chat,
	browser
}) => {
	// The unit tests fake Aegra, so this is the only place the thread read runs
	// through Aegra's real routes and auth handlers, against real rows.
	// Already signed in as the default subject by the beforeEach hook.
	const owner = await scoreOwnReply(page, chat);

	// The message it does own, minus the credentials. Aegra's own
	// `enable_custom_route_auth` leaves this at 200 — the route's own
	// `Depends(require_auth)` is what makes it 401.
	const anonymous = await page.request.post(owner.url, {
		data: { thread_id: owner.threadId, message_id: owner.messageId, score: 'up' }
	});
	expect(anonymous.status()).toBe(401);

	// A second signed-in user, with a valid token of their own, aiming at a
	// thread and message that exist and belong to the first. A random id would
	// be refused for not existing, whether or not access is checked at all.
	const otherContext = await browser.newContext();
	try {
		const otherPage = await otherContext.newPage();
		await authenticateUser(otherPage, OIDC_CONFIG.otherUsername);
		const other = await scoreOwnReply(otherPage, new ChatPage(new AppPage(otherPage)));
		expect(other.threadId).not.toEqual(owner.threadId);

		const foreign = await otherPage.request.post(owner.url, {
			headers: { Authorization: other.authorization },
			data: { thread_id: owner.threadId, message_id: owner.messageId, score: 'up' }
		});
		// 404 rather than 403: the answer must not confirm the thread exists.
		expect(foreign.status()).toBe(404);
	} finally {
		await otherContext.close();
	}
});

test('past the live checkpoint window, each answer is scored as its own message', async ({
	page,
	chat
}) => {
	// The SDK fetches only the latest ten checkpoints, and four turns make well
	// over ten. The run must come from the answer itself, not that window.
	const token = captureToken(page);
	const turns = 4;
	for (let i = 1; i <= turns; i++) await sendAndAwaitReply(chat, `Question ${i}`, i);

	await page.reload();
	await expect(chat.aiMessages).toHaveCount(turns, { timeout: 30_000 });
	const bodies = captureScores(page);

	for (const [index, score] of [
		[0, 'up'],
		[turns - 1, 'down']
	] as const) {
		const answer = chat.aiMessages.nth(index);
		await answer.hover();
		const scored = page.waitForResponse((res) => isScorePost(res.request()));
		await rate(chat, answer, score);
		expect((await scored).ok()).toBe(true);
	}

	// What the backend resolves those ids to: the run each answer carries must
	// be the run that produced it, in order, one run per answer.
	const threadId = bodies[0].thread_id;
	const headers = { Authorization: token()! };
	const api = LANGGRAPH_CONFIG.apiUrl;
	const runs = (await (
		await page.request.get(`${api}/threads/${threadId}/runs`, { headers })
	).json()) as {
		run_id: string;
		created_at: string;
	}[];
	const state = await (
		await page.request.get(`${api}/threads/${threadId}/state`, { headers })
	).json();
	const answers = (
		state.values.messages as { id: string; type: string; response_metadata?: { run_id?: string } }[]
	).filter((m) => m.type === 'ai');

	const runsInOrder = runs
		.sort((a, b) => a.created_at.localeCompare(b.created_at))
		.map((r) => r.run_id);
	expect(answers.map((m) => m.response_metadata?.run_id)).toEqual(runsInOrder);
	expect(bodies.map((b) => b.message_id)).toEqual([answers[0].id, answers[turns - 1].id]);
});

test('a submitted rating is acknowledged and not resubmittable until reload', async ({
	page,
	chat
}) => {
	const bodies = captureScores(page);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	const scored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, aiMessage, 'up');
	expect((await scored).ok()).toBe(true);

	const { up, down } = chat.feedbackButtons(aiMessage);
	await expect(up).toHaveClass(/bg-muted/);
	await expect(up).toBeDisabled();
	await expect(down).toBeDisabled();

	// Submit-only: nothing is read back, so a reload starts fresh, and rating
	// again is accepted -- the backend's score id makes it an update.
	await page.reload();
	await expect(chat.aiMessages).toHaveCount(1, { timeout: 30_000 });
	const restored = chat.aiMessages.first();
	await expect(chat.feedbackButtons(restored).up).not.toHaveClass(/bg-muted/);
	await restored.hover();
	const rescored = page.waitForResponse((res) => isScorePost(res.request()));
	await rate(chat, restored, 'down');
	expect((await rescored).ok()).toBe(true);
	expect(bodies.map((b) => b.message_id)).toEqual([bodies[0].message_id, bodies[0].message_id]);
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

	// Survives the round trip: the highlight is dropped on failure, so a thumb
	// still filled after the response — and no failure marker — is the evidence.
	await expect(chat.feedbackButtons(aiMessage).up).toHaveClass(/bg-muted/);
	await expect(aiMessage.getByTestId('feedback-failed')).toHaveCount(0);
});

test('message actions are visible on a touch device without hovering', async ({ browser }) => {
	// Regression: the actions row was only ever shown via `isHovered`, which a
	// touch tap never sets — on a device with no mouse the row (and the rating
	// buttons it carries) was permanently invisible.
	const context = await browser.newContext({ hasTouch: true });
	try {
		const touchPage = await context.newPage();
		await authenticateUser(touchPage);
		const chat = new ChatPage(new AppPage(touchPage));
		await gotoFreshThread(touchPage);
		await sendAndAwaitReply(chat, 'Hello', 1);

		const aiMessage = chat.aiMessages.first();
		await expect(aiMessage.getByTitle(/regenerate/i)).toBeVisible();
		await expect(chat.feedbackButtons(aiMessage).up).toBeVisible();
	} finally {
		await context.close();
	}
});

test('message actions are revealed by keyboard focus, not just hover', async ({ chat }) => {
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	const regenerate = aiMessage.getByTitle(/regenerate/i);
	// Visibility is opacity-driven, not removal from the DOM, so this guards
	// against a focus-within rule that never actually overrides it.
	await expect(regenerate).not.toBeVisible();

	// `:focus-within` doesn't care how focus arrived, so a direct `.focus()`
	// exercises the same CSS path a real Tab press would, without depending
	// on how many unrelated elements sit earlier in tab order.
	await regenerate.focus();
	await expect(regenerate).toBeVisible();
});

test('a failed rating marker stays visible after the pointer leaves', async ({ page, chat }) => {
	// Regression: the failure marker lived inside the same hover-opacity
	// wrapper as the rest of the row, so it vanished the instant the pointer
	// moved away — exactly when a user reads it after giving up on a hover.
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/feedback`, (route) =>
		route.fulfill({ status: 500, body: '{}' })
	);
	await sendAndAwaitReply(chat, 'Hello', 1);

	const aiMessage = chat.aiMessages.first();
	await aiMessage.hover();
	await chat.feedbackButtons(aiMessage).up.click();
	await expect(chat.feedbackDialog).toBeVisible();
	await chat.feedbackCancel.click();

	await expect(aiMessage.getByTestId('feedback-failed')).toBeVisible();

	// Move the pointer well away from the message, onto the input instead.
	await chat.textInput.hover();
	await expect(aiMessage.getByTestId('feedback-failed')).toBeVisible();
});
