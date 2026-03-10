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
const chunkMeta = {
	created_by: 'system',
	graph_id: 'chat',
	assistant_id: 'test-assistant',
	run_id: 'run--test-thinking-abc123',
	thread_id: 'test-thread-id'
};

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
		chunkMeta
	];
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
		const sseBody = buildSseStream(
			[
				{
					event: 'messages',
					data: aiChunk('', runId, { reasoning_content: 'Let me think about this carefully...' })
				},
				{
					event: 'messages',
					data: aiChunk('The answer is 42.', runId)
				}
			],
			runId
		);

		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: sseBody
			});
		});

		await chat.textInput.fill('What is the answer?');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'false');
	});

	test('clicking the thinking block expands it and shows thinking text', async ({ page, chat }) => {
		const runId = 'run--test-thinking-002';
		const sseBody = buildSseStream(
			[
				{
					event: 'messages',
					data: aiChunk('', runId, {
						reasoning_content: 'Let me reason through this step by step.'
					})
				},
				{
					event: 'messages',
					data: aiChunk('Here is my answer.', runId)
				}
			],
			runId
		);

		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: sseBody
			});
		});

		await chat.textInput.fill('Explain something');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await thinkingButton.click();

		await expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByText('Let me reason through this step by step.')).toBeVisible();
	});

	test('regular AI response text renders alongside thinking block', async ({ page, chat }) => {
		const runId = 'run--test-thinking-003';
		const sseBody = buildSseStream(
			[
				{
					event: 'messages',
					data: aiChunk('', runId, { reasoning_content: 'Some internal reasoning.' })
				},
				{
					event: 'messages',
					data: aiChunk('This is the final answer text.', runId)
				}
			],
			runId
		);

		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: sseBody
			});
		});

		await chat.textInput.fill('Give me an answer');
		await chat.textInput.press('Enter');

		await expect(page.getByRole('button', { name: /thinking/i })).toBeVisible();
		await expect(page.getByText('This is the final answer text.')).toBeVisible();
	});

	test('non-thinking AI response does not show thinking block', async ({ page, chat }) => {
		const runId = 'run--test-thinking-004';
		const sseBody = buildSseStream(
			[
				{
					event: 'messages',
					data: aiChunk('Hello! How can I help you today?', runId)
				}
			],
			runId
		);

		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: sseBody
			});
		});

		await chat.textInput.fill('Hello');
		await chat.textInput.press('Enter');

		await expect(page.getByText('Hello! How can I help you today?')).toBeVisible();
		await expect(page.getByRole('button', { name: /thinking/i })).not.toBeVisible();
	});

	test('thinking block appears with content-array format (Anthropic native)', async ({
		page,
		chat
	}) => {
		const runId = 'run--test-thinking-005';
		const sseBody = buildSseStream(
			[
				{
					event: 'messages',
					data: aiChunk(
						[
							{ type: 'thinking', thinking: 'Anthropic native thinking content.' },
							{ type: 'text', text: 'Anthropic native answer.' }
						],
						runId
					)
				}
			],
			runId
		);

		await page.route(`${LANGGRAPH_CONFIG.apiUrl}/threads/*/runs/stream`, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: sseBody
			});
		});

		await chat.textInput.fill('Test Anthropic format');
		await chat.textInput.press('Enter');

		const thinkingButton = page.getByRole('button', { name: /thinking/i });
		await expect(thinkingButton).toBeVisible();
		await expect(page.getByText('Anthropic native answer.')).toBeVisible();
	});
});
