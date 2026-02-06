import type { Locator, Page } from '@playwright/test';

/**
 * AppPage encapsulates common app-wide elements: navigation and user menu.
 */
export class AppPage {
	readonly page: Page;

	readonly main: Locator;

	// Navigation elements
	readonly header: Locator;
	readonly homeLink: Locator;
	readonly chatLink: Locator;
	readonly signInButton: Locator;

	// User menu elements
	readonly userMenuButton: Locator;
	readonly signOutButton: Locator;

	constructor(page: Page) {
		this.page = page;

		// Header
		this.header = this.page.getByRole('banner');
		this.homeLink = this.header.getByRole('link', { name: /home/i });
		this.chatLink = this.header.getByRole('link', { name: /chat/i });
		this.signInButton = this.header.getByRole('button', { name: 'Sign in' });

		// User menu
		this.userMenuButton = this.header.getByRole('button', { name: 'User' });

		// Using this.header instead of .page here gives errors.
		this.signOutButton = page.getByRole('button', { name: 'Sign out' });

		this.main = this.page.getByRole('main');
	}

	async signIn() {
		await this.signInButton.click();
	}

	/**
	 * Sign out via user menu dropdown.
	 * Note: Includes intentional waits to handle dropdown timing.
	 */
	async signOut() {
		await this.userMenuButton.click();
		await this.signOutButton.click();
	}

	async navigateToChat() {
		await this.chatLink.click();
	}

	async navigateToHome() {
		await this.homeLink.click();
	}
}
