import { test as base, expect, type Page } from '@playwright/test';

/**
 * OIDC Mock Configuration
 */
export const OIDC_CONFIG = {
	issuer: 'http://localhost:8080',
	clientId: 'svelte-langgraph',
	clientSecret: 'secret',
	username: 'test-user'
};

/**
 * Helper to complete OIDC authentication flow
 * The oidc-provider-mock automatically authenticates the test-user
 */
export async function authenticateUser(page: Page) {
	// Start from home page
	await page.goto('/');

	// Click the sign-in button to initiate OIDC flow
	const signInButton = page.getByRole('button', { name: /sign in/i });
	await expect(signInButton).toBeVisible();
	await signInButton.click();

	// The OIDC flow will:
	// 1. Redirect to the mock provider
	// 2. Mock provider authenticates automatically
	// 3. Redirect back to the app with auth code
	// 4. App exchanges code for tokens
	// 5. Redirects to home page

	// Wait for authentication to complete by checking for avatar button
	// This indicates successful authentication
	await expect(page.locator('#avatar-menu-button')).toBeVisible({ timeout: 20000 });

	// Verify sign-in button is gone
	await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
}

/**
 * Helper to sign out
 */
export async function signOut(page: Page) {
	// Click avatar menu
	await page.locator('#avatar-menu-button').click();

	// Click sign out button in dropdown
	await page.getByRole('menuitem', { name: /sign out/i }).click();

	// Wait for redirect to home page
	await page.waitForURL('/', { timeout: 5000 });

	// Verify sign-in button is visible again
	await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
}

/**
 * Test fixture that provides an authenticated page
 */
export const test = base.extend<{ authenticatedPage: Page }>({
	authenticatedPage: async ({ page }, use) => {
		await authenticateUser(page);
		await use(page);
	}
});

export { expect };
