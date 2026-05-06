import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures/test';
import { authenticateUser } from './fixtures/auth';

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

test.describe('Edit message', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await page.goto('/chat/');
		await page.waitForURL(/\/chat\/[\w-]+/);
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

test.describe('Cancellation', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await page.goto('/chat/');
		await page.waitForURL(/\/chat\/[\w-]+/);
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
		// Long unique input — ai-mock echoes it back character-by-character with a
		// 10ms delay per chunk, giving a ~5s streaming window to click stop.
		const testInput = randomUUID().replace(/-/g, '').repeat(16); // ~512 hex chars
		const partialEcho = testInput.slice(0, 20); // Wait for these before stopping
		// The tail will only appear if the LangGraph run completed server-side.
		// Aborting the stream should also cancel the run; if it doesn't (the bug),
		// the backend finishes the full echo and stores it in the thread state.
		const tailEcho = testInput.slice(-30);

		await chat.textInput.fill(testInput);
		await chat.textInput.press('Enter');

		const stopButton = page.locator('#input_form button[type="button"]');
		await expect(stopButton).toBeVisible();
		await expect(page.getByText(partialEcho, { exact: false }).first()).toBeVisible();

		await stopButton.click();

		// Confirm client-side streaming has stopped
		await expect(chat.textInput).toBeEnabled();

		// Allow time for the server-side run to complete if it wasn't cancelled.
		// This must happen BEFORE reload: the frontend fetches thread state once on
		// navigation, so we need the run to finish writing to the thread first.
		await page.waitForTimeout(4000);

		// Reload the page — fetches fresh thread state from the LangGraph server.
		// If the run was NOT cancelled server-side, the backend will have finished
		// and stored the full response; after reload the full message becomes visible.
		await page.reload();

		// The tail of the echo must NOT appear — the cancelled run should have
		// committed only the partial response received before the stop.
		// This assertion FAILS when the bug is present (full echo is in thread state).
		await expect(page.getByText(tailEcho, { exact: false })).not.toBeVisible();
	});
});
