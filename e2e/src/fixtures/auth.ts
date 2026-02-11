import { expect, type Page } from '@playwright/test';
import { AppPage, OidcPage, OIDC_CONFIG } from '../pages';

export { OIDC_CONFIG };

// Ensure redirect to OIDC provider
export async function expectOIDCProviderURL(page: Page) {
	await expect(page).toHaveURL((url) =>
		url.toString().startsWith(`${OIDC_CONFIG.issuer}/oauth2/authorize`)
	);
}

/**
 * Complete OIDC authentication flow.
 * The oidc-provider-mock automatically authenticates the test-user.
 */
export async function authenticateUser(page: Page) {
	const app = new AppPage(page);
	const oidc = new OidcPage(page);

	await page.goto('/');
	await app.signIn();

	await expectOIDCProviderURL(page);

	await oidc.authorize();
	await page.waitForURL('/');
	await expect(app.userMenuButton).toBeVisible();
}

/**
 * Sign out via user menu.
 * Waits for hydration first since the dropdown menu requires client-side JS.
 */
export async function signOut(page: Page) {
	const app = new AppPage(page);
	await app.signOut();
}

/**
 * Assert user is authenticated.
 */
export async function expectAuthenticated(page: Page) {
	const app = new AppPage(page);
	await expect(app.userMenuButton).toBeVisible();
	await expect(app.signInButton).not.toBeVisible();
}

/**
 * Assert user is unauthenticated.
 */
export async function expectUnauthenticated(page: Page) {
	const app = new AppPage(page);
	await expect(app.signInButton).toBeVisible();
	await expect(app.userMenuButton).not.toBeVisible();
}
