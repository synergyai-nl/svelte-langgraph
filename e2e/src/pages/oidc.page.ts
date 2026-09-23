import type { Locator, Page } from '@playwright/test';

/**
 * OIDC Mock Configuration
 */
export const OIDC_CONFIG = {
	issuer: 'http://localhost:8080',
	clientId: 'svelte-langgraph',
	clientSecret: 'secret',
	username: 'test-user',
	/** A second subject, used to prove one user cannot act on another's runs. */
	otherUsername: 'other-user'
} as const;

/**
 * OidcPage encapsulates the OIDC mock provider page interactions.
 */
export class OidcPage {
	readonly page: Page;
	readonly testUserButton: Locator;

	constructor(page: Page, username: string = OIDC_CONFIG.username) {
		this.page = page;
		// Exact: `test-user` is a substring of no other subject today, but a
		// loose match would silently pick the wrong button if one is added.
		this.testUserButton = page.getByRole('button', { name: username, exact: true });
	}

	/**
	 * Complete the OIDC authorization by clicking the test user button.
	 */
	async authorize() {
		await this.testUserButton.waitFor({ state: 'visible', timeout: 5000 });
		await this.testUserButton.click();
	}

	/**
	 * Check if currently on the OIDC authorization page.
	 */
	isAuthorizePage(): boolean {
		return this.page.url().startsWith(`${OIDC_CONFIG.issuer}/oauth2/authorize`);
	}
}
