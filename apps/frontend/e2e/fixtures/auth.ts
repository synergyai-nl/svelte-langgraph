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

	const nav = page.getByRole('navigation');

	// Click the sign-in button to initiate OIDC flow
	const signInButton = nav.getByRole('button', { name: /sign in/i });
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
	// There seems to be no other way to avoid flakiness on the sign out drop down.
	// Really, all of these waits have to be there, pending a better solution.
	// Seems Playwright's wait detection is failing here, somehow.
	// Also note that 100ms really is the golden number here - result of _extensive_ stress testing.
	const evilWaitDuration = 100;

	await page.waitForTimeout(evilWaitDuration);

	const nav = page.getByRole('navigation');
	const avatarButton = nav.getByRole('button', { name: 'test-user' });
	avatarButton.click();

	await page.waitForTimeout(evilWaitDuration);

	const signOutButton = nav.getByRole('button', { name: /sign out/i }).last();
	await signOutButton.click();

	await page.waitForTimeout(evilWaitDuration);
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
