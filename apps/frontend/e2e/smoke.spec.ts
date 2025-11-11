import { test, expect } from '@playwright/test';

test.describe('When on "/"', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should handle navigation', async ({ page }) => {
		// Should not crash and should show sign-in option
		await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
	});

	test('should be able to navigate', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL('/');
	});

	test('should show navigation', async ({ page }) => {
		await expect(page.getByRole('navigation')).toBeVisible();
	});

	test('should be able to naviate to chat', async ({ page }) => {
		const chatLink = page.getByRole('link', { name: /chat/i });
		await expect(chatLink).toBeVisible();

		await chatLink.click();
		await expect(page).toHaveURL('/chat');
	});
});
