import { type Page, type Locator } from '@playwright/test';

/**
 * Home Page Object Model
 * Encapsulates the home page (/) interactions and elements
 */
export class HomePage {
	readonly page: Page;
	readonly signInButton: Locator;
	readonly avatarMenuButton: Locator;
	readonly navigation: Locator;
	readonly userMenuDropdown: Locator;
	readonly signOutButton: Locator;

	constructor(page: Page) {
		this.page = page;

		// Navigation elements
		this.navigation = page.getByRole('navigation');
		this.signInButton = this.navigation.getByRole('button', { name: /sign in/i });

		// User menu elements
		this.avatarMenuButton = page.locator('#avatar-menu-button');
		this.userMenuDropdown = this.navigation.getByRole('button', { name: 'test-user' });
		this.signOutButton = this.navigation.getByRole('button', { name: /sign out/i }).last();
	}

	/**
	 * Navigate to the home page
	 */
	async goto() {
		await this.page.goto('/');
	}

	/**
	 * Check if user is authenticated
	 */
	async isAuthenticated(): Promise<boolean> {
		return await this.avatarMenuButton.isVisible();
	}

	/**
	 * Check if user is unauthenticated
	 */
	async isUnauthenticated(): Promise<boolean> {
		return await this.signInButton.isVisible();
	}

	/**
	 * Click sign in button
	 */
	async clickSignIn() {
		await this.signInButton.click();
	}

	/**
	 * Open user menu dropdown
	 */
	async openUserMenu() {
		// Small wait to ensure stability (as noted in original fixtures)
		await this.page.waitForTimeout(100);
		await this.userMenuDropdown.click();
	}

	/**
	 * Click sign out from user menu
	 */
	async clickSignOut() {
		await this.signOutButton.click();
		await this.page.waitForTimeout(100);
	}

	/**
	 * Complete sign out flow
	 */
	async signOut() {
		await this.openUserMenu();
		await this.clickSignOut();
	}
}