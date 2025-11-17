import { type Page, type Locator } from '@playwright/test';

/**
 * Base Page Object Model
 * Encapsulates common navigation and authentication elements from the base layout
 * Used by pages that inherit the base layout structure
 */
export class BasePage {
	readonly page: Page;
	readonly navigation: Locator;
	readonly signInButton: Locator;
	readonly avatarMenuButton: Locator;
	readonly signOutButton: Locator;

	constructor(page: Page) {
		this.page = page;

		// Navigation elements (base layout)
		this.navigation = page.getByRole('navigation');
		this.signInButton = this.navigation.getByRole('button', { name: /sign in/i });

		// User menu elements (base layout)
		this.avatarMenuButton = this.navigation.getByRole('button', { name: /test-user/i });
		this.signOutButton = this.navigation.getByRole('button', { name: /sign out/i }).last();
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
		// Small wait to ensure stability
		await this.page.waitForTimeout(100);
		await this.avatarMenuButton.click();
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
