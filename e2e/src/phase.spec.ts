import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';

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
 * These tests share backend thread state for the same authenticated user, so they
 * run serially to prevent races between concurrent phase mutations.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Phase state-sync', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await page.goto('/chat');
		await page.waitForURL(/\/chat\/.+/);
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

		// Bounded wait (~3 s) — the state-only run must NOT produce any chat message.
		await page.waitForTimeout(3000);
		expect(await aiGroups.count()).toBe(countBefore);

		// Input re-enabled confirms the run completed cleanly.
		await expect(chat.textInput).toBeEnabled({ timeout: 15000 });

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
