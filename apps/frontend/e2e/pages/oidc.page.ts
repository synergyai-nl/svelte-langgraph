import type { Locator, Page } from '@playwright/test';

/**
 * OIDC Mock Configuration
 */
export const OIDC_CONFIG = {
	issuer: 'http://localhost:8080',
	clientId: 'svelte-langgraph',
	clientSecret: 'secret',
	username: 'test-user'
} as const;

/**
 * OidcPage encapsulates the OIDC mock provider page interactions.
 */
export class OidcPage {
	readonly page: Page;
	readonly testUserButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.testUserButton = page.getByRole('button', { name: OIDC_CONFIG.username });
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
