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

	// Wait for navigation to OIDC provider
	await page.waitForURL(/localhost:8080/, { timeout: 10000 });

	// The OIDC mock provider shows an authorization page
	// Click the test-user button which automatically authenticates and authorizes
	const testUserButton = page.getByRole('button', { name: 'test-user' });
	await testUserButton.waitFor({ state: 'visible', timeout: 5000 });
	await testUserButton.click();

	// Wait for redirect back to the app
	await page.waitForURL(/localhost:5173/, { timeout: 10000 });

	// Wait for authentication to complete by checking for avatar button
	await expect(page.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });

	// Verify sign-in button is gone
	await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
}

/**
 * Helper to sign out
 */
export async function signOut(page: Page) {
	// Click avatar menu button - force the click to ensure it registers
	const avatarButton = page.locator('#avatar-menu-button');
	await avatarButton.click({ force: true });

	// Wait longer for the dropdown to initialize and animate
	await page.waitForTimeout(2000);

	// Find the sign-out button - it's the last one matching "sign out"
	// Check if any sign-out buttons exist and are visible
	const signOutButtons = page.getByRole('button', { name: /sign out/i });
	const count = await signOutButtons.count();

	// Click the last sign-out button (the one in the dropdown)
	if (count > 0) {
		await signOutButtons.last().click({ force: true });
	}

	// Wait for redirect to home page
	await page.waitForURL('/', { timeout: 5000 });

	// Verify sign-in button is visible again - give it more time to load
	await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({
		timeout: 10000
	});
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
