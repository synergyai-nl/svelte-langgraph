import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG, gotoFreshThread } from './fixtures/backend';

// Opt this file out of fullyParallel: the frontend reuses the most recent idle thread
// per user, so tests in this file frequently land on the SAME LangGraph thread. Run
// concurrently, the edit/branch tests rewind that shared thread's head to a parent
// checkpoint while the cancellation test polls `/threads/{id}/state` — moving the head
// to a branch that excludes the cancelled run's messages and making its positive guard
// (human message present in state) fail nondeterministically. `mode: 'default'` runs
// this file's tests sequentially in one worker (other files still run in parallel;
// thinking.spec fully mocks the LangGraph endpoints and auth.spec never submits runs,
// so they cannot mutate threads).
test.describe.configure({ mode: 'default' });

test('user can send a message and receive an AI response', async ({ page, chat }) => {
	await authenticateUser(page);

	await page.goto('/chat');
	await page.waitForURL(/\/chat\/.+/);

	await chat.textInput.fill('Hello');
	await chat.textInput.press('Enter');

	// Wait for an AI message card to appear
	const aiMessage = page
		.getByRole('group')
		.filter({ has: page.locator('.prose') })
		.first();
	await expect(aiMessage).toBeVisible();
	await expect(aiMessage).not.toBeEmpty();
});

test.describe('Streaming', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		// Fresh thread — content-sensitive assertions, see fixtures/backend.ts#gotoFreshThread.
		await gotoFreshThread(page);
	});

	test('AI response streams into the UI incrementally, not only on completion', async ({
		page,
		chat
	}) => {
		// The mock echoes ~256 chars with a per-chunk delay (~13s total), which
		// doesn't fit the default 30s test timeout together with first-token latency.
		test.setTimeout(90_000);
		// Regression test: the backend wraps the react agent as a subgraph node, and
		// LangGraph only emits subgraph LLM token events when the client submits with
		// streamSubgraphs — without it the answer pops in whole at run completion.
		// The ai-mock echoes the input back chunk-by-chunk with a per-chunk delay,
		// giving a multi-second window in which partial AI output must be visible.
		// Distinct UUIDs (not one repeated) so the head and tail slices are
		// unique substrings — a repeated input would contain its own "tail" in
		// every repetition, making the mid-stream assertion below vacuous.
		const testInput = Array.from({ length: 8 }, () => randomUUID().replace(/-/g, '')).join('');
		const partialEcho = testInput.slice(0, 20);
		const tailEcho = testInput.slice(-20);

		await chat.textInput.fill(testInput);
		await chat.textInput.press('Enter');

		// Scope to AI message bodies — the user's own bubble contains the full
		// input text, so a broader locator would match it trivially. AI cards use
		// `prose` (with the literal class "dark:prose-invert"), user cards use
		// `prose prose-invert`, so :not(.prose-invert) selects AI bubbles only.
		const aiProse = page.locator('.prose:not(.prose-invert)');
		const aiWithPartial = aiProse.filter({ hasText: partialEcho });
		const aiWithTail = aiProse.filter({ hasText: tailEcho });

		// The echo's head must appear in an AI bubble mid-run: before its tail
		// exists and while the input is still disabled (run in flight). The
		// generous timeout only tolerates first-token latency (cold dev server);
		// incrementality itself is enforced by the two assertions that follow,
		// which must hold at whatever moment the partial first renders.
		await expect(aiWithPartial.first()).toBeVisible({ timeout: 30_000 });
		await expect(aiWithTail).toHaveCount(0);
		await expect(chat.textInput).toBeDisabled();

		// The run then completes normally: full echo present, input re-enabled.
		await expect(aiWithTail.first()).toBeVisible({ timeout: 45_000 });
		await expect(chat.textInput).toBeEnabled({ timeout: 45_000 });
	});
});

test.describe('Edit message', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		// Fresh thread per test (not page.goto('/chat/')) — these assertions match on
		// message content/count, so they must not inherit another spec's idle thread
		// (and its persisted state, e.g. `phase`) via getOrCreateThread's latest-idle
		// reuse. See fixtures/backend.ts#gotoFreshThread for the full rationale.
		await gotoFreshThread(page);
	});

	test('edit button opens a textarea with original message text', async ({ page, chat }) => {
		await chat.textInput.fill('Hello');
		await chat.textInput.press('Enter');

		// Wait for the user message to appear
		const userMessageGroup = page
			.getByRole('group')
			.filter({ has: page.getByText('Hello') })
			.first();
		await expect(userMessageGroup).toBeVisible();

		// Hover to reveal the edit button and click it
		await userMessageGroup.hover();
		await userMessageGroup.getByTitle(/edit/i).click();

		// The edit textarea appears above the chat input, so it is nth(0)
		const editTextarea = page.getByRole('textbox').nth(0);
		await expect(editTextarea).toBeVisible();
		await expect(editTextarea).toHaveValue('Hello');
	});

	test('pressing Escape cancels editing', async ({ page, chat }) => {
		await chat.textInput.fill('Hello');
		await chat.textInput.press('Enter');

		const userMessageGroup = page
			.getByRole('group')
			.filter({ has: page.getByText('Hello') })
			.first();
		await expect(userMessageGroup).toBeVisible();

		await userMessageGroup.hover();
		await userMessageGroup.getByTitle(/edit/i).click();

		await page.keyboard.press('Escape');

		// Edit textarea is removed; only the chat input textbox remains
		await expect(page.getByText('Hello').first()).toBeVisible();
		await expect(page.getByRole('textbox')).toHaveCount(1);
	});

	test('editing and submitting branches the conversation', async ({ page, chat }) => {
		const messageId = randomUUID();
		const originalQuestion = `First question ${messageId}`;
		const editedQuestion = `Edited question ${messageId}`;

		await chat.textInput.fill(originalQuestion);
		await chat.textInput.press('Enter');

		const aiMessage = page
			.getByRole('group')
			.filter({ has: page.locator('.prose') })
			.first();
		await expect(aiMessage).toBeVisible();
		await expect(aiMessage).not.toBeEmpty();
		// Wait for streaming to finish — edit button is disabled while streaming.
		await expect(chat.textInput).toBeEnabled();

		// Edit the user message
		const userMessageGroup = page
			.getByRole('group')
			.filter({ has: page.getByText(originalQuestion) })
			.first();
		await userMessageGroup.hover();
		await userMessageGroup.getByTitle(/edit/i).click();

		const editTextarea = page.getByRole('textbox').nth(0);
		await editTextarea.fill(editedQuestion);
		await editTextarea.press('Enter');

		// Verify the edited prompt is shown and a response was regenerated.
		// We don't assert the response text changed — the LLM may produce the
		// same output at low temperature — we only assert it completed.
		await expect(page.getByText(editedQuestion).first()).toBeVisible();
		await expect(aiMessage).toBeVisible();
		await expect(aiMessage).not.toBeEmpty();
	});
});

test.describe('Regenerate message', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		// Fresh thread per test — see rationale in the 'Edit message' describe above.
		await gotoFreshThread(page);
	});

	test('regenerating produces a new AI generation (not a checkpoint replay)', async ({
		page,
		chat
	}) => {
		// The echo mock makes regenerated content identical to the original, so the
		// only honest signal that the model actually re-ran is a NEW message id in
		// thread state. A checkpoint replay (the failure mode when the agent subgraph
		// has its own persistence) would return the cached message with the same id.
		const question = `Question ${randomUUID()}`;

		// Capture the Bearer token for direct API reads (same pattern as cancellation).
		let capturedToken: string | null = null;
		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/**`, async (route) => {
			const authHeader = route.request().headers()['authorization'];
			if (authHeader?.startsWith('Bearer ')) {
				capturedToken = authHeader.substring(7);
			}
			await route.continue();
		});

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const aiMessage = page
			.getByRole('group')
			.filter({ has: page.locator('.prose') })
			.filter({ hasText: question })
			.last();
		await expect(aiMessage).toBeVisible();
		// Wait for streaming to finish — the regenerate button is unavailable while streaming.
		await expect(chat.textInput).toBeEnabled();

		const threadId = new URL(page.url()).pathname.split('/').at(-1)!;
		// Guard against a route that never observed an authenticated request (e.g. request
		// timing changes) — fail with a clear message instead of a null-assertion crash below.
		expect(capturedToken, 'no authenticated request observed via page.route').toBeTruthy();
		const headers = { Authorization: `Bearer ${capturedToken!}` };

		// Read the AI message answering our unique question from committed thread state.
		const readAnswer = async () => {
			const res = await page.request.get(`${LANGGRAPH_CONFIG.apiUrl}/threads/${threadId}/state`, {
				headers
			});
			expect(res.ok()).toBeTruthy();
			const state = await res.json();
			const messages = (state.values?.messages ?? []) as Array<{
				type: string;
				id: string;
				content: unknown;
			}>;
			const questionIndex = messages.findIndex(
				(m) => m.type === 'human' && String(m.content).includes(question)
			);
			if (questionIndex < 0) return undefined;
			return messages.slice(questionIndex + 1).find((m) => m.type === 'ai');
		};

		const before = await readAnswer();
		expect(before).toBeTruthy();

		await aiMessage.hover();
		await aiMessage.getByTitle(/regenerate/i).click();

		// Poll until the branched head shows a different AI message id.
		const deadline = Date.now() + 15_000;
		let after = before;
		while (Date.now() < deadline) {
			after = await readAnswer();
			if (after && after.id !== before!.id) break;
			await page.waitForTimeout(200);
		}
		expect(after?.id, 'regenerate must produce a new AI message id').not.toBe(before!.id);

		// The UI settles with a visible answer and the input re-enabled.
		await expect(aiMessage).toBeVisible();
		await expect(chat.textInput).toBeEnabled();
	});
});

test.describe('Cancellation', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		// Fresh thread per test — see rationale in the 'Edit message' describe above.
		await gotoFreshThread(page);
	});

	test('user can cancel a running generation', async ({ page, chat }) => {
		// Long unique input — ai-mock echoes it back character-by-character with a
		// 10ms delay per chunk, giving a ~5s streaming window to click stop.
		const testInput = randomUUID().replace(/-/g, '').repeat(16); // ~512 hex chars
		const partialEcho = testInput.slice(0, 20); // First 20 chars to wait for

		await chat.textInput.fill(testInput);
		await chat.textInput.press('Enter');

		// Wait for the stop button to appear — confirms streaming is active.
		// The stop button (type="button") only renders when isStreaming=true;
		// the submit button (type="submit") renders otherwise.
		const stopButton = page.locator('#input_form button[type="button"]');
		await expect(stopButton).toBeVisible();

		// Also confirm partial content has started arriving
		await expect(page.getByText(partialEcho, { exact: false }).first()).toBeVisible();

		await stopButton.click();

		// Partial content is preserved after stopping
		await expect(page.getByText(partialEcho, { exact: false }).first()).toBeVisible();

		// is_streaming=false → input re-enabled, no error shown
		await expect(chat.textInput).toBeEnabled();
		await expect(page.getByRole('alert')).not.toBeVisible();
	});

	test('cancelling a generation stops the run server-side (not just the stream)', async ({
		page,
		chat
	}) => {
		// The state-polling and quiescence-settling loops below can legitimately take
		// close to a minute on a cold run (first request against a freshly-started
		// backend), well beyond Playwright's 30s default test timeout.
		test.setTimeout(90_000);

		// Long unique input — ai-mock echoes it back with MOCK_STREAM_DELAY (50ms) per
		// chunk, giving a wide streaming window for the cancel to land server-side.
		const testInput = randomUUID().replace(/-/g, '').repeat(16); // ~512 hex chars
		const partialEcho = testInput.slice(0, 20); // Wait for these before stopping
		// tailEcho only appears in thread state if the LangGraph run ran to completion.
		const tailEcho = testInput.slice(-30);

		// Intercept LangGraph requests to capture the Bearer token before we need it
		// for direct API calls. Registered before the message is sent so the stream
		// request (which fires on Enter) is guaranteed to be intercepted.
		let capturedToken: string | null = null;
		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/**`, async (route) => {
			const authHeader = route.request().headers()['authorization'];
			if (authHeader?.startsWith('Bearer ')) {
				capturedToken = authHeader.substring(7);
			}
			await route.continue();
		});

		await chat.textInput.fill(testInput);
		await chat.textInput.press('Enter');

		const stopButton = page.locator('#input_form button[type="button"]');
		await expect(stopButton).toBeVisible();
		await expect(page.getByText(partialEcho, { exact: false }).first()).toBeVisible();

		await stopButton.click();

		// Confirm client-side streaming has stopped
		await expect(chat.textInput).toBeEnabled();

		// By now streaming has started and stopped, so the token must be set
		expect(capturedToken).toBeTruthy();
		const threadId = new URL(page.url()).pathname.split('/').at(-1)!;
		const apiUrl = LANGGRAPH_CONFIG.apiUrl;
		const headers = { Authorization: `Bearer ${capturedToken!}` };

		// Poll until the run is no longer active (pending/running → success/interrupted/…).
		// This replaces the fixed waitForTimeout(4000): we wait exactly as long as needed.
		const deadline = Date.now() + 15_000;
		let isActive = true;
		while (Date.now() < deadline) {
			const runsRes = await page.request.get(`${apiUrl}/threads/${threadId}/runs`, { headers });
			expect(runsRes.ok()).toBeTruthy();
			const runs = (await runsRes.json()) as Array<{ status: string }>;
			isActive = runs.some((r) => r.status === 'pending' || r.status === 'running');
			if (!isActive) break;
			await page.waitForTimeout(200);
		}
		// Fail loudly if the deadline expired while the run was still active — otherwise
		// the state read below could race and the test would pass on incomplete data.
		expect(isActive).toBe(false);

		// Read the committed thread state directly — no page reload needed.
		type ThreadMessage = { type: string; content: unknown };
		async function readState(): Promise<ThreadMessage[] | undefined> {
			const stateRes = await page.request.get(`${apiUrl}/threads/${threadId}/state`, { headers });
			expect(stateRes.ok()).toBeTruthy();
			const state = await stateRes.json();
			return state.values?.messages as ThreadMessage[] | undefined;
		}

		// The inmem runtime flushes checkpoints asynchronously (dev persistence flush
		// loop), so the human message may land in state shortly AFTER the run goes
		// inactive. Poll instead of reading once to avoid racing the flush — 10s was
		// not always enough headroom on a cold run (freshly-started backend), so allow
		// up to 30s here.
		let messages: ThreadMessage[] | undefined;
		let hasOurMessage = false;
		const stateDeadline = Date.now() + 30_000;
		while (Date.now() < stateDeadline) {
			messages = await readState();

			// Positive guard: our human message must exist in state, confirming the run fired.
			// partialEcho is unique (randomUUID per run), so even if the thread has accumulated
			// history from prior test iterations, we'll find exactly our message.
			hasOurMessage =
				messages?.some((m) => m.type === 'human' && String(m.content).includes(partialEcho)) ??
				false;
			if (hasOurMessage) break;
			await page.waitForTimeout(300);
		}
		expect(hasOurMessage).toBe(true);

		// The human message landing does NOT mean the thread state has fully quiesced:
		// the cancelled run's AI-side flush is subject to the exact same async
		// persistence delay, so asserting absence right on the snapshot where the human
		// message FIRST appears is racy — a real cancellation regression could flush a
		// beat later and still slip past a same-snapshot check. Require quiescence
		// first: keep re-reading state until two consecutive reads are identical (a
		// fixed settle period alone isn't reliable, since flushes don't run on a fixed
		// schedule), THEN assert the negative on that settled snapshot.
		let settled = false;
		let previousSnapshot = JSON.stringify(messages);
		const quiescenceDeadline = Date.now() + 15_000;
		while (Date.now() < quiescenceDeadline) {
			await page.waitForTimeout(500);
			messages = await readState();
			const snapshot = JSON.stringify(messages);
			if (snapshot === previousSnapshot) {
				settled = true;
				break;
			}
			previousSnapshot = snapshot;
		}
		expect(settled).toBe(true);

		// Both assertions are made on the same settled snapshot: the positive guard
		// (human message present, confirming the run fired) and the main assertion
		// (the cancelled run must NOT have committed the full echo — tailEcho only
		// appears when the model node ran to completion before cancel landed).
		expect(
			messages?.some((m) => m.type === 'human' && String(m.content).includes(partialEcho))
		).toBe(true);
		const aiContent = (messages?.filter((m) => m.type === 'ai') ?? [])
			.map((m) => String(m.content))
			.join('');
		expect(aiContent).not.toContain(tailEcho);
	});
});
