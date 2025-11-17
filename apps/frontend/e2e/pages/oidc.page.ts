import { type Page, type Locator, expect } from '@playwright/test';

/**
 * OIDC Provider Page Object Model
 * Encapsulates OIDC authentication provider interactions
 */
export class OIDCPage {
	readonly page: Page;
	readonly testUserButton: Locator;
	readonly issuer: string;

	constructor(page: Page, issuer = 'http://localhost:8080') {
		this.page = page;
		this.issuer = issuer;

		// OIDC provider elements
		this.testUserButton = page.getByRole('button', { name: 'test-user' });
	}

	/**
	 * Check if we're on the OIDC provider authorization page
	 */
	async isOnAuthorizePage(): Promise<boolean> {
		const url = this.page.url();
		return url.startsWith(`${this.issuer}/oauth2/authorize`);
	}

	/**
	 * Wait for redirect to OIDC provider
	 */
	async waitForOIDCRedirect() {
		await expect(this.page).toHaveURL((url) =>
			url.toString().startsWith(`${this.issuer}/oauth2/authorize`)
		);
	}

	/**
	 * Authenticate as test user
	 */
	async authenticateAsTestUser() {
		await this.testUserButton.waitFor({ state: 'visible', timeout: 5000 });
		await this.testUserButton.click();
	}

	/**
	 * Wait for redirect back to application after authentication
	 */
	async waitForAppRedirect(expectedPath = '/') {
		await this.page.waitForURL(expectedPath, { timeout: 5000 });
	}

	/**
	 * Verify OIDC well-known configuration is accessible
	 */
	async verifyWellKnownConfig() {
		const response = await this.page.request.get(`${this.issuer}/.well-known/openid-configuration`);
		expect(response.ok()).toBeTruthy();

		const config = await response.json();
		expect(config.issuer).toBe(this.issuer);
		expect(config.authorization_endpoint).toBeTruthy();
		expect(config.token_endpoint).toBeTruthy();

		return config;
	}
}
