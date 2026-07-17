import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';

/**
 * Phase state-sync E2E tests.
 *
 * The phase dropdown (data-testid="state-field-phase") is rendered by StateField
 * once the assistant schema loads.  Changing it submits a state-only LangGraph run
 * (no message, no LLM call) via stream.submit.  The backend entry router applies
 * the phase and exits.  The AI can also change phase via the `change_phase` tool;
 * the update reaches stream.values when the agent node completes its superstep
 * (root-level `values` events are per OUTER superstep — without streamSubgraphs
 * the tool's update is not visible mid-generation).
 *
 * Each test gets its own freshly created thread (see gotoFreshThread below), so
 * these tests no longer share backend thread state with each other or with other
 * spec files. Serial mode is kept as a belt-and-suspenders safeguard against any
 * future same-file thread sharing, though it is not currently load-bearing.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Create a brand-new LangGraph thread and navigate directly to it.
 *
 * Every E2E spec authenticates as the same hardcoded OIDC identity (test-user,
 * see pages/oidc.page.ts). Navigating to the plain `/chat` route calls
 * getOrCreateThread() (apps/frontend/src/lib/langgraph/client.ts), which reuses
 * the most-recently-updated *idle* thread for that user rather than creating a
 * fresh one. That means this spec could otherwise end up sharing — and racing
 * on — the exact same thread as chat.spec.ts, backend-integration.spec.ts, or
 * auth.spec.ts when they run concurrently.
 *
 * The `/chat/[threadID]` route pins the app to whatever thread id is in the
 * URL with no reuse logic of its own, so creating the thread directly via the
 * LangGraph REST API and navigating straight there sidesteps getOrCreateThread
 * entirely — a pure test concern, no production code changes needed.
 */
async function gotoFreshThread(page: Page) {
	const sessionRes = await page.request.get('/auth/session');
	expect(sessionRes.ok()).toBeTruthy();
	const session = await sessionRes.json();
	const accessToken = session?.accessToken as string | undefined;
	expect(accessToken, 'expected an accessToken on the Auth.js session').toBeTruthy();

	const threadRes = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		data: { metadata: {} }
	});
	expect(threadRes.ok()).toBeTruthy();
	const thread = (await threadRes.json()) as { thread_id: string };

	await page.goto(`/chat/${thread.thread_id}`);
}

test.describe('Phase state-sync', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await gotoFreshThread(page);
	});

	test('manual phase change is state-only and persists', async ({ page, chat }) => {
		// Wait for schema to load — the phase wrapper only renders once schema is available.
		await expect(chat.phaseWrapper).toBeVisible({ timeout: 15000 });
		await expect(chat.phaseSelect).toBeVisible();

		// Wait for the initial stream reconnect to settle before we interact.
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

		// Pick a target phase that differs from the current value so the change event fires.
		const currentValue = await chat.phaseSelect.inputValue();
		const targetValue = currentValue === 'draft' ? 'research' : 'draft';

		// Snapshot AI message-group count before the phase change.
		const aiGroups = page.getByRole('group').filter({ has: page.locator('.prose') });
		const countBefore = await aiGroups.count();

		// Change the phase — this triggers a state-only run (entry router, no LLM call).
		await chat.phaseSelect.selectOption(targetValue);

		// Optimistic update: dropdown reflects the new value immediately.
		await expect(chat.phaseSelect).toHaveValue(targetValue);

		// Input re-enabled is the reliable "run finished" signal (matches the house style
		// in chat.spec.ts — no fixed sleeps). Only once it resolves do we know the
		// state-only run has fully completed, so only then is it safe to assert that it
		// did NOT produce any chat message.
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });
		expect(await aiGroups.count()).toBe(countBefore);

		// Reload to verify the server committed the phase (not just an optimistic value).
		await page.reload();
		await expect(chat.phaseWrapper).toBeVisible({ timeout: 15000 });
		await expect(chat.phaseSelect).toHaveValue(targetValue);
	});

	test('phase is visible to the model', async ({ page, chat }) => {
		// Wait for schema and initial stream.
		await expect(chat.phaseWrapper).toBeVisible({ timeout: 15000 });
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

		// Set phase to "draft" and wait for the state-only run to commit.
		await chat.phaseSelect.selectOption('draft');
		await expect(chat.phaseSelect).toHaveValue('draft');
		// Wait for stream.isLoading → false (state-only run complete, server committed phase).
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

		// Send a unique message to avoid matching any cached content.
		// Avoid "Please switch to the review phase" — that triggers the tool-call mock.
		const uniqueId = randomUUID();
		await chat.textInput.fill(`What phase are we in? ${uniqueId}`);
		await chat.textInput.press('Enter');

		// The backend system message at offset 1 is "Current phase: draft".
		// The ai-mock matches that and replies "PHASE_VISIBLE: draft".
		await expect(page.getByText('PHASE_VISIBLE: draft', { exact: false }).first()).toBeVisible({
			timeout: 20000
		});

		// Confirm the run finished cleanly.
		await expect(chat.textInput).toBeEnabled({ timeout: 20000 });
	});

	test('AI-driven phase change updates the dropdown live', async ({ page, chat }) => {
		// Wait for schema and initial stream.
		await expect(chat.phaseWrapper).toBeVisible({ timeout: 15000 });
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

		// Set phase to "research" first so the AI-driven change to "review" is observable.
		await chat.phaseSelect.selectOption('research');
		await expect(chat.phaseSelect).toHaveValue('research');
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

		// Send the exact trigger message — the ai-mock responds with change_phase("review").
		await chat.textInput.fill('Please switch to the review phase');
		await chat.textInput.press('Enter');

		// The change_phase tool updates graph state; the update lands in stream.values
		// when the agent node's superstep completes (effectively at run end — root
		// `values` events don't surface subgraph progress mid-generation).
		await expect(chat.phaseSelect).toHaveValue('review', { timeout: 20000 });

		// Run completes normally: input re-enabled (streaming did not stall).
		await expect(chat.textInput).toBeEnabled({ timeout: 20000 });

		// An AI message appears after the tool call (echoed user text from the follow-up LLM call).
		const aiMessage = page
			.getByRole('group')
			.filter({ has: page.locator('.prose') })
			.first();
		await expect(aiMessage).toBeVisible({ timeout: 20000 });
		await expect(aiMessage).not.toBeEmpty();
	});
});
