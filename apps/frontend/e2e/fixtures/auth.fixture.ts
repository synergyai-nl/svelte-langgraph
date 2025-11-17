import { test as base } from './pages.fixture';

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
 * Authentication-related fixtures
 */
type AuthFixtures = {
	authenticatedPage: void;
	authHelpers: AuthHelpers;
};

/**
 * Authentication helper methods
 */
interface AuthHelpers {
	authenticateUser: () => Promise<void>;
	signOut: () => Promise<void>;
	expectAuthenticated: () => Promise<void>;
	expectUnauthenticated: () => Promise<void>;
}

/**
 * Extend test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
	/**
	 * Fixture that automatically authenticates before each test
	 * Use this when all tests in a file need authentication
	 */
	authenticatedPage: [
		async ({ homePage, oidcPage }, use) => {
			// Authenticate before test
			await homePage.goto();
			await homePage.clickSignIn();
			await oidcPage.waitForOIDCRedirect();
			await oidcPage.authenticateAsTestUser();
			await oidcPage.waitForAppRedirect('/');

			// Run test
			await use();

			// No cleanup needed - browser context is isolated per test
		},
		{ auto: false }
	],

	/**
	 * Authentication helper methods as a fixture
	 * Provides reusable auth methods without auto-authentication
	 */
	authHelpers: async ({ homePage, oidcPage }, use) => {
		const helpers: AuthHelpers = {
			authenticateUser: async () => {
				await homePage.goto();
				await homePage.clickSignIn();
				await oidcPage.waitForOIDCRedirect();
				await oidcPage.authenticateAsTestUser();
				await oidcPage.waitForAppRedirect('/');
			},

			signOut: async () => {
				await homePage.signOut();
			},

			expectAuthenticated: async () => {
				const { expect } = await import('@playwright/test');
				await expect(homePage.avatarMenuButton).toBeVisible();
				await expect(homePage.signInButton).not.toBeVisible();
			},

			expectUnauthenticated: async () => {
				const { expect } = await import('@playwright/test');
				await expect(homePage.signInButton).toBeVisible();
				await expect(homePage.avatarMenuButton).not.toBeVisible();
			}
		};

		await use(helpers);
	}
});

export { expect } from '@playwright/test';
