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
 * Wait for OIDC mock provider to be ready
 */
async function waitForOIDCProvider(page: Page, timeout = 30000): Promise<void> {
	const startTime = Date.now();
	while (Date.now() - startTime < timeout) {
		try {
			const response = await page.request.get(
				`${OIDC_CONFIG.issuer}/.well-known/openid-configuration`
			);
			if (response.ok()) {
				return;
			}
		} catch (error) {
			// Provider not ready yet, continue waiting
		}
		await page.waitForTimeout(500);
	}
	throw new Error(`OIDC provider not ready after ${timeout}ms`);
}

/**
 * Helper to complete OIDC authentication flow
 * The oidc-provider-mock automatically authenticates the test-user
 */
export async function authenticateUser(page: Page) {
	// Start from home page
	await page.goto('/');

	// Track navigation for debugging
	page.on('request', (request) => {
		if (request.url().includes('localhost:8080') || request.url().includes('/signin')) {
			console.log(`Request: ${request.method()} ${request.url()}`);
		}
	});

	page.on('response', (response) => {
		if (response.url().includes('localhost:8080') || response.url().includes('/signin')) {
			console.log(`Response: ${response.status()} ${response.url()}`);
		}
	});

	// Click the sign-in button to initiate OIDC flow
	const signInButton = page.getByRole('button', { name: /sign in/i });
	await expect(signInButton).toBeVisible();

	console.log('Clicking sign in button...');
	await signInButton.click();

	// Wait for navigation to OIDC provider
	console.log('Waiting for navigation to OIDC provider...');
	await page.waitForURL(/localhost:8080/, { timeout: 10000 });
	console.log('Navigated to OIDC provider:', page.url());

	// The OIDC mock provider shows an authorization page
	// Look for and click the approve/allow button
	console.log('Looking for authorization button...');
	const approveButton = page
		.locator(
			'button:has-text("Approve"), button:has-text("Allow"), button:has-text("Accept"), input[type="submit"][value="Approve"], input[type="submit"][value="Allow"]'
		)
		.first();

	// Wait for the button to be visible
	await approveButton.waitFor({ state: 'visible', timeout: 5000 });
	console.log('Found authorization button, clicking...');
	await approveButton.click();

	// Wait for redirect back to the app
	console.log('Waiting for redirect back to app...');
	await page.waitForURL(/localhost:5173/, { timeout: 10000 });
	console.log('Redirected back to app:', page.url());

	// Wait for authentication to complete by checking for avatar button
	console.log('Waiting for avatar button...');
	await expect(page.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });

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
