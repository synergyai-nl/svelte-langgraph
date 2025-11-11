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

	// Ensure redirect to OIDC provider
	await expect(page).toHaveURL((url) =>
		url.toString().startsWith(`${OIDC_CONFIG.issuer}/oauth2/authorize`)
	);

	// The OIDC mock provider shows an authorization page
	// Click the test-user button which automatically authenticates and authorizes
	const testUserButton = page.getByRole('button', { name: 'test-user' });
	await testUserButton.waitFor({ state: 'visible', timeout: 5000 });
	await testUserButton.click();

	// Wait for redirect to home page
	await page.waitForURL('/', { timeout: 5000 });
}

/**
 * Helper to sign out
 */
export async function signOut(page: Page) {
	// Click avatar menu button - wait for it to be ready
	const avatarButton = page.locator('#avatar-menu-button');
	await expect(avatarButton).toBeVisible();
	await avatarButton.click();

	// Wait for the sign-out button in the dropdown to be visible and ready
	// The button is within a navigation area and should be clickable once the dropdown animation completes
	const signOutButton = page.getByRole('button', { name: /sign out/i }).last();
	await expect(signOutButton).toBeVisible();

	// Wait for the button to be enabled and ready for interaction (ensures dropdown animation completed)
	await expect(signOutButton).toBeEnabled();

	// Click the sign-out button
	await signOutButton.click();

	// Wait for redirect to home page
	await page.waitForURL('/', { timeout: 5000 });
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

/**
 * Reusable assertion helpers to reduce redundancy
 */
export async function expectAuthenticated(page: Page) {
	await expect(page.locator('#avatar-menu-button')).toBeVisible();
	await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
}

export async function expectUnauthenticated(page: Page) {
	await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
	await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
}

export { expect };
