import type { Page } from '@playwright/test';
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

/** Registers a route that fulfills the LangGraph thread-history endpoint. */
async function mockThreadHistory(page: Page, messages: unknown[]): Promise<void> {
	await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/history`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(buildHistoryState(messages))
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

		// Register mocks BEFORE submitting — the history route must be in place before
		// the post-stream refetch fires, and the stream route before the run is submitted.
		await mockThreadHistory(page, [
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

		await chat.textInput.fill('What is the answer?');
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

		await mockThreadHistory(page, [
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

		await chat.textInput.fill('Explain something');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
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

		await mockThreadHistory(page, [
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

		await chat.textInput.fill('Give me an answer');
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

		await mockThreadHistory(page, [historyAiMessage('msg-4', answer)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(answer, 'msg-4') }], runId);

		await chat.textInput.fill('Hello');
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

		await mockThreadHistory(page, [historyAiMessage('msg-5', content)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(content, 'msg-5') }], runId);

		await chat.textInput.fill('Test Anthropic format');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

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

		await mockThreadHistory(page, [historyAiMessage('msg-6', content)]);
		await mockRunStream(page, [{ event: 'messages', data: aiChunk(content, 'msg-6') }], runId);

		await chat.textInput.fill('Test langchain v1 format');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText(answer)).toBeVisible();

		await thinkingButton.click();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText(reasoning)).toBeVisible();
	});
});
