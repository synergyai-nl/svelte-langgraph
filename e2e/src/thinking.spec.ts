import type { Page } from '@playwright/test';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';

/**
 * Builds a minimal SSE stream body for LangGraph messages-tuple streaming.
 * Each chunk is formatted as a Server-Sent Event with event + data fields.
 */
function buildSseStream(
	chunks: Array<{ event: string; data: unknown }>,
	runId: string = 'run--test-thinking-abc123'
): string {
	const metadataEvent = [
		'id: 0',
		'event: metadata',
		`data: {"run_id":"${runId}","attempt":1}`,
		''
	].join('\n');

	const messageEvents = chunks.map(({ event, data }, i) =>
		['id: ' + (i + 1), 'event: ' + event, 'data: ' + JSON.stringify(data), ''].join('\n')
	);

	return [metadataEvent, ...messageEvents].join('\n');
}

/** Base metadata object appended to every chunk in messages-tuple mode */
function chunkMeta(runId: string) {
	return {
		created_by: 'system',
		graph_id: 'chat',
		assistant_id: 'test-assistant',
		run_id: runId,
		thread_id: 'test-thread-id'
	};
}

/**
 * Builds a `messages-tuple` SSE chunk payload: [serializedAIMessageChunk, metadata].
 * Chunks sharing the same `id` are concatenated client-side by the SDK (langchain
 * message-chunk merge semantics), so splitting reasoning/content across multiple
 * chunks with the same id exercises that concatenation.
 */
function aiChunk(
	content: unknown,
	id: string,
	additionalKwargs: Record<string, unknown> = {}
): [unknown, unknown] {
	return [
		{
			content,
			additional_kwargs: additionalKwargs,
			response_metadata: {},
			type: 'AIMessageChunk',
			name: null,
			id,
			example: false,
			tool_calls: [],
			invalid_tool_calls: [],
			usage_metadata: null,
			tool_call_chunks: []
		},
		chunkMeta(id)
	];
}

/** Registers a route that fulfills the LangGraph runs/stream endpoint with a canned SSE body. */
async function mockRunStream(
	page: Page,
	chunks: Array<{ event: string; data: unknown }>,
	runId: string
): Promise<void> {
	const sseBody = buildSseStream(chunks, runId);
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
		await route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: sseBody
		});
	});
}

/** Formats a single raw SSE frame (id/event/data lines + trailing blank line). */
function sseEventFrame(id: number, event: string, data: unknown): string {
	return ['id: ' + id, 'event: ' + event, 'data: ' + JSON.stringify(data), ''].join('\n') + '\n';
}

interface HeldOpenStreamServer {
	/** The absolute URL of the locally-started server, e.g. `http://127.0.0.1:54213`. */
	url: string;
	/** Shuts the server down. Safe to call multiple times. */
	close: () => Promise<void>;
}

/**
 * Starts a plain Node `http` server that speaks the LangGraph messages-tuple SSE
 * protocol, but — unlike `mockRunStream` (which uses `route.fulfill` with a
 * complete, static body) — keeps the HTTP response OPEN after writing the initial
 * frames, only writing the final frames and closing the connection after `holdMs`.
 *
 * `route.fulfill` cannot represent an in-progress stream: it requires the entire
 * response body up front. To genuinely pin live-streaming behaviour, the request
 * needs to stay open server-side while the test inspects the page. Since
 * `page.route()`'s `route.continue({ url })` lets a test rewrite a request's
 * destination to any same-protocol URL, tests can point the LangGraph runs/stream
 * request at this locally-owned server instead of fulfilling it outright, giving a
 * real (not simulated) streaming connection under full test control.
 *
 * Binds to an OS-assigned ephemeral port (port 0) to avoid collisions between
 * parallel test workers. CORS headers are wide open since the browser still
 * enforces real CORS against this cross-origin (different port) server.
 */
async function startHeldOpenStreamServer(options: {
	runId: string;
	initialChunks: Array<{ event: string; data: unknown }>;
	finalChunks: Array<{ event: string; data: unknown }>;
	holdMs: number;
}): Promise<HeldOpenStreamServer> {
	const { runId, initialChunks, finalChunks, holdMs } = options;
	const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

	const server = http.createServer((req, res) => {
		// Browsers do not reliably accept a wildcard for Access-Control-Allow-Headers
		// on non-simple requests — notably it does not cover `Authorization` per the
		// Fetch spec, and engines differ. Echo back whatever the preflight actually
		// requested, falling back to the explicit headers this stream request sends
		// (Authorization, Content-Type: application/json) if none was requested.
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers':
				req.headers['access-control-request-headers'] ?? 'authorization, content-type',
			'Access-Control-Max-Age': '86400'
		};

		if (req.method === 'OPTIONS') {
			res.writeHead(204, corsHeaders);
			res.end();
			return;
		}

		res.writeHead(200, {
			...corsHeaders,
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		});

		// Frame 0 is the metadata event; initial chunks follow immediately so the
		// client sees them right away, before the connection is deliberately held open.
		res.write(sseEventFrame(0, 'metadata', { run_id: runId, attempt: 1 }));
		initialChunks.forEach(({ event, data }, i) => res.write(sseEventFrame(i + 1, event, data)));

		const timer = setTimeout(() => {
			pendingTimers.delete(timer);
			finalChunks.forEach(({ event, data }, i) =>
				res.write(sseEventFrame(initialChunks.length + 1 + i, event, data))
			);
			res.end();
		}, holdMs);
		pendingTimers.add(timer);

		req.on('close', () => {
			clearTimeout(timer);
			pendingTimers.delete(timer);
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${address.port}`;

	return {
		url,
		close: () =>
			new Promise<void>((resolve) => {
				for (const timer of pendingTimers) clearTimeout(timer);

				// Guard against a second `close()` call: `server.close()` on an
				// already-closed server invokes its callback with an
				// `ERR_SERVER_NOT_RUNNING` error instead of shutting anything down
				// further, which would otherwise mask the original test failure with
				// a spurious secondary error in a `finally`/teardown path.
				if (!server.listening) {
					resolve();
					return;
				}

				try {
					server.close(() => resolve());
					// `close()` only stops new connections; force-destroy any still-open
					// keep-alive sockets (e.g. if the test failed before the hold elapsed).
					server.closeAllConnections?.();
				} catch {
					resolve();
				}
			})
	};
}

/**
 * Builds a minimal `ThreadState[]` response for the `/threads/{id}/history` endpoint.
 *
 * HAZARD: useStream is configured with `fetchStateHistory: true`, so after every run
 * completes it POSTs `/threads/{id}/history` and REPLACES the in-memory messages with
 * that response. Since our mocked SSE stream never touches the real backend, the real
 * history endpoint would return no matching state — wiping out the mocked AI message.
 * Every test that asserts on post-stream UI state must mock this endpoint to return the
 * same final message content the SSE stream produced.
 *
 * A single-element history list short-circuits the SDK's branch-sequence computation
 * (`history.length <= 1`), so no parent/child checkpoint wiring is required beyond a
 * plausible-looking checkpoint object.
 */
function buildHistoryState(messages: unknown[]) {
	return [
		{
			values: { messages },
			next: [],
			tasks: [],
			metadata: {},
			created_at: new Date().toISOString(),
			checkpoint: { thread_id: 'test-thread-id', checkpoint_ns: '', checkpoint_id: 'checkpoint-1' },
			parent_checkpoint: null
		}
	];
}

/** A committed human message, as returned by the (mocked) thread-history endpoint. */
function historyHumanMessage(id: string, text: string) {
	return {
		type: 'human',
		id,
		content: text,
		additional_kwargs: {},
		response_metadata: {}
	};
}

/**
 * Registers a route that fulfills the LangGraph thread-history endpoint.
 *
 * The real backend's committed thread history always includes the human turn that
 * kicked off the run, ahead of the AI response. If the mocked history omits it, the
 * client's in-memory message list (which has no human message at all — our mocked SSE
 * stream never emits one either) gains a brand-new human list item the instant the
 * post-stream refetch lands, triggering an 800ms `fly` intro/reflow on the message list
 * right as a test may be interacting with it. Always including the human turn here keeps
 * the post-refetch swap free of that surprise insertion.
 */
async function mockThreadHistory(
	page: Page,
	humanText: string,
	aiMessages: unknown[]
): Promise<void> {
	const humanMessage = historyHumanMessage('e2e-history-human-1', humanText);
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/history`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(buildHistoryState([humanMessage, ...aiMessages]))
		});
	});
}

/** A committed AI message, as returned by the (mocked) thread-history endpoint. */
function historyAiMessage(
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

/**
 * Waits for the post-stream history refetch to land AND for the resulting message-list
 * reflow (the 800ms `fly` transition on newly (re)keyed list items — see
 * `mockThreadHistory` above) to fully settle, before a test interacts with the page.
 *
 * Clicking immediately after the human/AI text becomes visible is racy: the text can be
 * visible while the surrounding list item is still animating into its final position,
 * which intermittently makes Playwright report the click target as "not stable". Since
 * `playwright.config.ts` sets `retries: 0`, tests must not depend on winning that race.
 */
async function waitForSettledHistory(page: Page, humanText: string): Promise<void> {
	await expect(page.getByText(humanText, { exact: true }).first()).toBeVisible();
	// 800ms fly transition (see ChatMessages.svelte) + margin for the reflow to settle.
	await page.waitForTimeout(900);
}

test.describe('Thinking block UI', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await page.goto('/chat/');
		await page.waitForURL(/\/chat\/[\w-]+/);
	});

	test('thinking block appears collapsed when AI response includes thinking (additional_kwargs format)', async ({
		page,
		chat
	}) => {
		const runId = 'run--test-thinking-001';
		const reasoning = 'Let me think about this carefully...';
		const answer = 'The answer is 42.';
		const question = 'What is the answer?';

		// Register mocks BEFORE submitting — the history route must be in place before
		// the post-stream refetch fires, and the stream route before the run is submitted.
		await mockThreadHistory(page, question, [
			historyAiMessage('msg-1', answer, { reasoning_content: reasoning })
		]);
		await mockRunStream(
			page,
			[
				{ event: 'messages', data: aiChunk('', 'msg-1', { reasoning_content: reasoning }) },
				{ event: 'messages', data: aiChunk(answer, 'msg-1') }
			],
			runId
		);

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
		const runId = 'run--test-thinking-002';
		// Reasoning is split across three SSE chunks sharing the same message id to
		// exercise the SDK's client-side concatenation of additional_kwargs.reasoning_content.
		const reasoningParts = ['Let me reason through ', 'this step ', 'by step.'];
		const fullReasoning = reasoningParts.join('');
		const answer = 'Here is my answer.';
		const question = 'Explain something';

		await mockThreadHistory(page, question, [
			historyAiMessage('msg-2', answer, { reasoning_content: fullReasoning })
		]);
		await mockRunStream(
			page,
			[
				...reasoningParts.map((part) => ({
					event: 'messages',
					data: aiChunk('', 'msg-2', { reasoning_content: part })
				})),
				{ event: 'messages', data: aiChunk(answer, 'msg-2') }
			],
			runId
		);

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		// Wait for the post-stream history refetch (which now includes the human turn)
		// to land and its list-reflow transition to settle before clicking — clicking
		// mid-transition is the reproduced flake this fixes (see waitForSettledHistory).
		await waitForSettledHistory(page, question);
		await thinkingButton.click();

		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(fullReasoning)).toBeVisible();
	});

	test('regular AI response text renders alongside thinking block, with thinking above the card', async ({
		page,
		chat
	}) => {
		const runId = 'run--test-thinking-003';
		const reasoning = 'Some internal reasoning.';
		const answer = 'This is the final answer text.';
		const question = 'Give me an answer';

		await mockThreadHistory(page, question, [
			historyAiMessage('msg-3', answer, { reasoning_content: reasoning })
		]);
		await mockRunStream(
			page,
			[
				{ event: 'messages', data: aiChunk('', 'msg-3', { reasoning_content: reasoning }) },
				{ event: 'messages', data: aiChunk(answer, 'msg-3') }
			],
			runId
		);

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		const answerText = page.getByText(answer);
		await expect(thinkingButton).toBeVisible();
		await expect(answerText).toBeVisible();

		// Thinking block renders above the message card within the same group.
		const thinkingBox = await thinkingButton.boundingBox();
		const answerBox = await answerText.boundingBox();
		expect(thinkingBox).not.toBeNull();
		expect(answerBox).not.toBeNull();
		expect(thinkingBox!.y).toBeLessThan(answerBox!.y);
	});

	test('non-thinking AI response does not show a thinking block', async ({ page, chat }) => {
		const runId = 'run--test-thinking-004';
		const answer = 'Hello! How can I help you today?';
		const question = 'Hello';

		await mockThreadHistory(page, question, [historyAiMessage('msg-4', answer)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(answer, 'msg-4') }], runId);

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		await expect(page.getByText(answer)).toBeVisible();
		await expect(page.getByRole('button', { name: /thinking/i })).not.toBeVisible();
	});

	test('thinking block appears with Anthropic native content-array shape (type: thinking)', async ({
		page,
		chat
	}) => {
		const runId = 'run--test-thinking-005';
		const reasoning = 'Anthropic native thinking content.';
		const answer = 'Anthropic native answer.';
		const content = [
			{ type: 'thinking', thinking: reasoning },
			{ type: 'text', text: answer }
		];
		const question = 'Test Anthropic format';

		await mockThreadHistory(page, question, [historyAiMessage('msg-5', content)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(content, 'msg-5') }], runId);

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		await waitForSettledHistory(page, question);
		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(reasoning)).toBeVisible();
	});

	test('thinking block appears with langchain v1 content-array shape (type: reasoning)', async ({
		page,
		chat
	}) => {
		const runId = 'run--test-thinking-006';
		const reasoning = 'Considering the langchain v1 reasoning block format.';
		const answer = 'Langchain v1 answer.';
		const content = [
			{ type: 'reasoning', reasoning },
			{ type: 'text', text: answer }
		];
		const question = 'Test langchain v1 format';

		await mockThreadHistory(page, question, [historyAiMessage('msg-6', content)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(content, 'msg-6') }], runId);

		await chat.textInput.fill(question);
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		await waitForSettledHistory(page, question);
		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(reasoning)).toBeVisible();
	});

	test('thinking block displays live while the run is still streaming, before it completes', async ({
		page,
		chat
	}) => {
		// The held-open stream deliberately keeps the connection open for several
		// seconds, plus settle waits afterwards — comfortably exceeds the 30s default.
		test.setTimeout(60_000);

		const runId = 'run--test-thinking-007';
		const messageId = 'msg-7';
		// Reasoning is delivered as two separate deltas while the connection is held
		// open, pinning both live display AND client-side concatenation of the parts
		// actually received so far (not a value baked into a single canned fixture).
		const reasoningParts = ['Streaming thought, part one. ', 'And now part two.'];
		const fullReasoning = reasoningParts.join('');
		const answer = 'The completed streamed answer.';
		const question = 'Stream while thinking, please';
		const holdMs = 4000;

		const server = await startHeldOpenStreamServer({
			runId,
			initialChunks: reasoningParts.map((part) => ({
				event: 'messages',
				data: aiChunk('', messageId, { reasoning_content: part })
			})),
			finalChunks: [{ event: 'messages', data: aiChunk(answer, messageId) }],
			holdMs
		});

		try {
			await mockThreadHistory(page, question, [
				historyAiMessage(messageId, answer, { reasoning_content: fullReasoning })
			]);

			// Proxy the run-stream request to our locally-owned server (see
			// startHeldOpenStreamServer) instead of fulfilling it outright — a `route.fulfill`
			// response can only ever deliver a complete, static body, which cannot represent a
			// stream that's still in progress.
			await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
				await route.continue({ url: server.url });
			});

			await chat.textInput.fill(question);
			await chat.textInput.press('Enter');

			// While the connection is still held open server-side (the AI message has
			// thinking but no text yet), only the thinking block renders — no message
			// card — per ChatMessage.svelte's empty-text-with-thinking behaviour.
			const thinkingButton = page.getByRole('button', { name: /thinking/i });
			await expect(thinkingButton).toBeVisible();
			await expect(page.getByText(answer)).not.toBeVisible();

			await thinkingButton.click();
			await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
			// Both reasoning deltas, concatenated client-side, are visible mid-stream.
			await expect(page.getByText(fullReasoning)).toBeVisible();

			// The final chunk still hasn't been delivered — the server is holding the
			// connection open for `holdMs`.
			await expect(page.getByText(answer)).not.toBeVisible();

			// Let the server complete the stream (final text chunk + close) and confirm
			// the finished state still renders correctly once the run wraps up and the
			// post-stream history refetch lands.
			await expect(page.getByText(answer)).toBeVisible({ timeout: holdMs + 10_000 });
			await waitForSettledHistory(page, question);
			await expect(thinkingButton).toBeVisible();
			await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
			await expect(page.getByText(fullReasoning)).toBeVisible();
		} finally {
			await server.close();
		}
	});
});
