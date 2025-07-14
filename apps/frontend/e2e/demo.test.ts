import { expect, test } from '@playwright/test';

test('placeholder e2e test', async ({ page }) => {
	// Simple placeholder test that doesn't require the app to be running
	await page.goto('about:blank');
	await expect(page).toHaveTitle('');
});
