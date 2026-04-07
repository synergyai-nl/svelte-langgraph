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

test.describe('Cancellation', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
		await page.goto('/chat/');
		await page.waitForURL(/\/chat\/[\w-]+/);
	});

	test('user can cancel a running generation', async ({ page, chat }) => {
		// Long unique input — ai-mock echoes it back character-by-character,
		// creating a wide streaming window
		const testInput = randomUUID().replace(/-/g, '').repeat(8); // ~256 hex chars
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

		// Use dispatchEvent instead of click() — the SubmitButton has transition-all
		// CSS which makes Playwright's stability check wait for the animation to
		// settle. With useStream the streaming window can be narrow, so the button
		// may detach before the stability check completes.
		await stopButton.dispatchEvent('click');

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
		// Long unique input — ai-mock echoes it back character-by-character.
		// useStream batches updates, so we need a much longer input to ensure the
		// streaming window is wide enough to reliably click stop mid-flight.
		const testInput = randomUUID().replace(/-/g, '').repeat(32); // ~1024 hex chars
		const partialEcho = testInput.slice(0, 20); // Wait for these before stopping
		// The tail will only appear if the LangGraph run completed server-side.
		// Aborting the stream should also cancel the run; if it doesn't (the bug),
		// the backend finishes the full echo and stores it in the thread state.
		const tailEcho = testInput.slice(-30);

		await chat.textInput.fill(testInput);
		await chat.textInput.press('Enter');

		// Wait for BOTH the stop button AND partial echo simultaneously to minimize
		// the gap between confirmation and click — useStream batches updates so the
		// streaming window can be narrow.
		const stopButton = page.locator('#input_form button[type="button"]');
		await Promise.all([
			expect(stopButton).toBeVisible(),
			expect(page.getByText(partialEcho, { exact: false }).first()).toBeVisible()
		]);

		// Use dispatchEvent to bypass Playwright's CSS stability check — the Button
		// component has transition-all which delays click() while the stop button
		// can be detached if streaming finishes during the transition.
		await stopButton.dispatchEvent('click');

		// Confirm client-side streaming has stopped
		await expect(chat.textInput).toBeEnabled();

		// Allow time for the server-side run to complete if it wasn't cancelled.
		// This must happen BEFORE reload: the frontend fetches thread state once on
		// navigation, so we need the run to finish writing to the thread first.
		await page.waitForTimeout(2000);

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
