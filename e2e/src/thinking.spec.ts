import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG, gotoFreshThread } from './fixtures/backend';
import { fakeRuns, streamedAiMessage, type FakeEvent, type SentMessage } from './fixtures/fakeRun';

/** A stored human message, as the thread state and `values` events carry it. */
function storedHumanMessage(id: string, text: string) {
	return { type: 'human', id, content: text, additional_kwargs: {}, response_metadata: {} };
}

/** A stored AI message, as the thread state and `values` events carry it. */
function storedAiMessage(
	id: string,
	content: unknown,
	additionalKwargs: Record<string, unknown> = {}
) {
	return {
		type: 'ai',
		id,
		content,
		additional_kwargs: additionalKwargs,
		response_metadata: {},
		tool_calls: [],
		invalid_tool_calls: []
	};
}

/** The end of a run: the stored exchange (`before`, the sent message, `answer`), then success. */
function finished(sent: SentMessage, answer: unknown, before: unknown[] = []): FakeEvent[] {
	return [
		{
			method: 'values',
			data: { messages: [...before, storedHumanMessage(sent.id, sent.content), answer] }
		},
		{ method: 'lifecycle', data: { event: 'completed' } }
	];
}

/**
 * Waits for the message list to settle before a test clicks or measures: the exchange's rows
 * animate in (`in:fly`, see MessagesList.svelte), and a click on a row that is still moving
 * makes Playwright report the target as "not stable". `playwright.config.ts` sets
 * `retries: 0`, so tests must not depend on winning that race.
 */
async function waitForSettledList(page: Page, humanText: string): Promise<void> {
	await expect(page.getByText(humanText, { exact: true }).first()).toBeVisible();
	await page.waitForTimeout(900);
}

test.describe('Thinking block UI', () => {
	let runs: { close: () => Promise<void> } | undefined;

	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await gotoFreshThread(page);
	});

	test.afterEach(async () => {
		await runs?.close();
		runs = undefined;
	});

	test('thinking block appears collapsed when AI response includes thinking (additional_kwargs format)', async ({
		page,
		chat
	}) => {
		const reasoning = 'Let me think about this carefully...';
		const answer = 'The answer is 42.';
		const question = 'What is the answer?';

		runs = await fakeRuns(page, (sent) => ({
			first: finished(sent, storedAiMessage('msg-1', answer, { reasoning_content: reasoning }))
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByText(answer)).toBeVisible();
	});

	test('clicking the thinking block expands it and shows the full concatenated thinking text', async ({
		page,
		chat
	}) => {
		// Reasoning is streamed as three deltas of one block to exercise the SDK's client-side
		// concatenation; the streamed copy stays on screen after the stored one arrives.
		const reasoningParts = ['Let me reason through ', 'this step ', 'by step.'];
		const fullReasoning = reasoningParts.join('');
		const answer = 'Here is my answer.';
		const question = 'Explain something';

		runs = await fakeRuns(page, (sent) => ({
			first: [
				...streamedAiMessage('msg-2', [
					{ type: 'reasoning', parts: reasoningParts },
					{ type: 'text', parts: [answer] }
				]),
				...finished(sent, storedAiMessage('msg-2', answer, { reasoning_content: fullReasoning }))
			]
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		// Clicking mid-transition is the reproduced flake this avoids (see waitForSettledList).
		await waitForSettledList(page, question);
		await thinkingButton.click();

		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(fullReasoning)).toBeVisible();
	});

	test('regular AI response text renders alongside thinking block, with thinking above the card', async ({
		page,
		chat
	}) => {
		const reasoning = 'Some internal reasoning.';
		const answer = 'This is the final answer text.';
		const question = 'Give me an answer';

		runs = await fakeRuns(page, (sent) => ({
			first: finished(sent, storedAiMessage('msg-3', answer, { reasoning_content: reasoning }))
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		const answerText = page.getByText(answer);
		await expect(thinkingButton).toBeVisible();
		await expect(answerText).toBeVisible();

		// Let the rows settle before measuring geometry: `boundingBox()` — unlike
		// `toBeVisible()` — does not auto-retry (see `waitForSettledList`).
		await waitForSettledList(page, question);
		await expect(thinkingButton).toBeVisible();
		await expect(answerText).toBeVisible();

		// Thinking block renders above the message card within the same group. Wrapped in
		// `toPass()` so a residual mid-animation box retries instead of failing.
		await expect(async () => {
			const thinkingBox = await thinkingButton.boundingBox();
			const answerBox = await answerText.boundingBox();
			expect(thinkingBox).not.toBeNull();
			expect(answerBox).not.toBeNull();
			expect(thinkingBox!.y).toBeLessThan(answerBox!.y);
		}).toPass();
	});

	test('non-thinking AI response does not show a thinking block', async ({ page, chat }) => {
		const answer = 'Hello! How can I help you today?';
		const question = 'Hello';

		runs = await fakeRuns(page, (sent) => ({
			first: finished(sent, storedAiMessage('msg-4', answer))
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		await expect(page.getByText(answer)).toBeVisible();
		await expect(page.getByRole('button', { name: /thinking/i })).not.toBeVisible();
	});

	test('thinking block appears with Anthropic native content-array shape (type: thinking)', async ({
		page,
		chat
	}) => {
		const reasoning = 'Anthropic native thinking content.';
		const answer = 'Anthropic native answer.';
		const content = [
			{ type: 'thinking', thinking: reasoning },
			{ type: 'text', text: answer }
		];
		const question = 'Test Anthropic format';

		runs = await fakeRuns(page, (sent) => ({
			first: finished(sent, storedAiMessage('msg-5', content))
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		await waitForSettledList(page, question);
		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(reasoning)).toBeVisible();
	});

	test('thinking block appears with langchain v1 content-array shape (type: reasoning)', async ({
		page,
		chat
	}) => {
		const reasoning = 'Considering the langchain v1 reasoning block format.';
		const answer = 'Langchain v1 answer.';
		const content = [
			{ type: 'reasoning', reasoning },
			{ type: 'text', text: answer }
		];
		const question = 'Test langchain v1 format';

		runs = await fakeRuns(page, (sent) => ({
			first: finished(sent, storedAiMessage('msg-6', content))
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		await waitForSettledList(page, question);
		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(reasoning)).toBeVisible();
	});

	test('thinking block displays live while the run is still streaming, before it completes', async ({
		page,
		chat
	}) => {
		// The fake run deliberately holds its answer back for several seconds, plus settle
		// waits afterwards — comfortably exceeds the 30s default.
		test.setTimeout(60_000);

		const messageId = 'msg-7';
		// Reasoning is delivered as two separate deltas while the connection is held
		// open, pinning both live display AND client-side concatenation of the parts
		// actually received so far (not a value baked into a single canned fixture).
		const reasoningParts = ['Streaming thought, part one. ', 'And now part two.'];
		const fullReasoning = reasoningParts.join('');
		const answer = 'The completed streamed answer.';
		const question = 'Stream while thinking, please';
		const holdMs = 4000;

		// The reasoning block streams at once; its text block, the stored exchange and the end
		// of the run only after `holdMs`.
		const events = streamedAiMessage(messageId, [
			{ type: 'reasoning', parts: reasoningParts },
			{ type: 'text', parts: [answer] }
		]);
		// `message-start`, then the reasoning block's start, deltas and finish.
		const reasoningEnd = 1 + reasoningParts.length + 2;
		runs = await fakeRuns(page, (sent) => ({
			first: events.slice(0, reasoningEnd),
			rest: [
				...events.slice(reasoningEnd),
				...finished(sent, storedAiMessage(messageId, answer, { reasoning_content: fullReasoning }))
			],
			holdMs
		}));

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		// While the connection is still held open server-side (the AI message has
		// thinking but no text yet), only the thinking block renders — no message
		// card — per ChatMessage.svelte's empty-text-with-thinking behaviour.
		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).not.toBeVisible();

		// The thinking pill's icon animates (data-streaming) while the run is still
		// in flight, so the UI doesn't feel stuck during the thinking phase.
		await expect(thinkingButton).toHaveAttribute('data-streaming', 'true');

		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		// Both reasoning deltas, concatenated client-side, are visible mid-stream.
		await expect(page.getByText(fullReasoning)).toBeVisible();

		// The text block still hasn't been delivered — the fake run holds it for `holdMs`.
		await expect(page.getByText(answer)).not.toBeVisible();

		// Let the run finish and confirm the finished state still renders correctly.
		await expect(page.getByText(answer)).toBeVisible({ timeout: holdMs + 10_000 });
		await waitForSettledList(page, question);
		await expect(thinkingButton).toBeVisible();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(fullReasoning)).toBeVisible();

		// Once the run has completed, the pill is no longer the in-flight message, so the
		// streaming animation stops.
		await expect(thinkingButton).toHaveAttribute('data-streaming', 'false');
	});
});

/**
 * Builds enough prior human/AI exchanges that the message list overflows a
 * standard viewport height, so a newly streamed message won't already be
 * visible without the container actually scrolling.
 */
function seedOverflowingHistory(exchangeCount: number): unknown[] {
	const messages: unknown[] = [];
	for (let i = 0; i < exchangeCount; i++) {
		messages.push(
			storedHumanMessage(
				`seed-human-${i}`,
				`Seed question ${i + 1}: padding out the prior conversation so the message list ` +
					'overflows the viewport before the new question is asked.'
			)
		);
		messages.push(
			storedAiMessage(
				`seed-ai-${i}`,
				`Seed answer ${i + 1}: a reasonably long reply so each exchange takes up real ` +
					'vertical space and the conversation reliably overflows a standard viewport.'
			)
		);
	}
	return messages;
}

test.describe('Thinking block UI - scrolling with an already-overflowing history', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
	});

	test('scrolls a live, thinking-only AI response into view when prior conversation already overflows the viewport', async ({
		page,
		chat
	}) => {
		// Same rationale as the live-streaming test above: the held-back answer plus settle
		// waits comfortably exceed the 30s default.
		test.setTimeout(60_000);

		const messageId = 'msg-overflow-1';
		const reasoning = 'Thinking about the question after a long prior conversation...';
		const answer = 'The final answer, delivered after scrolling into view.';
		const question = 'One more question after a long conversation';
		const holdMs = 4000;

		const seedMessages = seedOverflowingHistory(10);

		// The thread's state is read the instant the conversation mounts, so the route that
		// seeds it is registered before navigating. `next: []` marks the thread idle.
		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/state`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					values: { messages: seedMessages },
					next: [],
					tasks: [],
					metadata: {},
					created_at: new Date(0).toISOString(),
					checkpoint: { thread_id: 'seeded', checkpoint_ns: '', checkpoint_id: 'seeded-1' },
					parent_checkpoint: null
				})
			})
		);
		await gotoFreshThread(page);

		// Sanity-check the seeded conversation actually overflows the viewport —
		// otherwise this test would pass vacuously, since a container that never
		// needs to scroll looks identical to one that scrolled correctly.
		//
		// `div.overflow-y-auto`, not the bare class, and NOT `.first()`: SLG-104's root
		// layout restructuring (routes/+layout.svelte) made the app's <main> element itself
		// `min-h-0 flex-1 overflow-y-auto`, as the single outer viewport-height reference.
		// That <main> now sits ahead of Chat.svelte's own message-list container
		// (`<div class="min-h-0 flex-1 overflow-y-auto pb-4">`) in DOM order, so plain
		// `.overflow-y-auto`.first() picks the wrong (outer, non-scrolling — the actual
		// scrolling happens in the inner container) element. ChatInput's textarea also
		// carries `overflow-y-auto` and sits later in the DOM, so `.last()` is equally
		// unreliable. Both the outer container and the textarea are non-`<div>` tags (`<main>`
		// and `<textarea>` respectively), so a `div.overflow-y-auto` tag-scoped selector
		// uniquely and stably identifies Chat's own scroll container.
		//
		// Generous poll timeout: this is pure layout/reflow of 10 seeded exchanges, which can
		// take longer than the default 10s under full-suite parallel load (many headless
		// Chromium instances competing for CPU) without indicating any real regression.
		const scrollContainer = page.locator('div.overflow-y-auto').first();
		await expect(scrollContainer).toBeVisible();
		await expect
			.poll(() => scrollContainer.evaluate((el) => el.scrollHeight > el.clientHeight), {
				timeout: 20000
			})
			.toBe(true);

		const events = streamedAiMessage(messageId, [
			{ type: 'reasoning', parts: [reasoning] },
			{ type: 'text', parts: [answer] }
		]);
		// `message-start`, then the reasoning block's start, delta and finish.
		const reasoningEnd = 4;
		const runs = await fakeRuns(page, (sent) => ({
			first: events.slice(0, reasoningEnd),
			rest: [
				...events.slice(reasoningEnd),
				...finished(
					sent,
					storedAiMessage(messageId, answer, { reasoning_content: reasoning }),
					seedMessages
				)
			],
			holdMs
		}));

		try {
			await chat.textInput.fill(question);
			await chat.textInput.press('Enter');

			// While the fake run holds its answer back, the new AI message has
			// thinking but no text yet, and the message list already overflows the
			// viewport (asserted above). Confirms the end-to-end outcome that
			// ScrollableContainer's `scrollToMe` fix targets: a thinking-only message
			// is scrolled into view rather than staying below the fold.
			//
			// NOTE: this does not, on its own, discriminate the one-line regression the
			// fix addresses — with a long prior conversation already rendered, every
			// existing message row's own `scrollToMe` attachment also re-fires on each
			// stream tick (ChatMessages' `messages` array is rebuilt with fresh object
			// references on every update, so each keyed row's attach re-evaluates) and
			// keeps the container pinned to the bottom regardless of the thinking-only
			// row's own gate. Verified this by reverting only the ScrollableContainer
			// fix and re-running this test: it still passed, and instrumenting
			// `Element.prototype.scrollTo` showed ~40 calls firing during the stream
			// from those other rows alone. The `ScrollableContainer.svelte.test.ts` unit
			// tests isolate the single-row case and are the real regression guard for
			// this fix; this E2E test remains valuable end-to-end coverage of the
			// user-visible outcome (chat UX changes require E2E coverage per this
			// repo's CLAUDE.md) and would catch a regression in the overall behavior.
			const thinkingButton = page.getByRole('button', { name: /thinking/i });
			await expect(thinkingButton).toBeVisible();
			await expect(page.getByText(answer)).not.toBeVisible();
			await expect(thinkingButton).toBeInViewport();

			await expect(page.getByText(answer)).toBeVisible({ timeout: holdMs + 10_000 });
			await expect(thinkingButton).toBeInViewport();
		} finally {
			await runs.close();
		}
	});
});
