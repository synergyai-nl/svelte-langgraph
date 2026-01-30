import type { Locator, Page } from '@playwright/test';

/**
 * AppPage encapsulates common app-wide elements: navigation and user menu.
 */
export class AppPage {
	readonly page: Page;

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
		this.userMenuButton = page.getByRole('button', { name: 'User' });
		this.signOutButton = page.getByRole('button', { name: 'Sign out' });
	}

	async signIn() {
		await this.signInButton.click();
	}

	/**
	 * Sign out via user menu dropdown.
	 * Note: Includes intentional waits to handle Flowbite dropdown timing.
	 */
	async signOut() {
		const waitMs = 200;
		await this.page.waitForTimeout(waitMs);
		await this.userMenuButton.click();
		await this.page.waitForTimeout(waitMs);
		await this.signOutButton.click();
		await this.page.waitForTimeout(waitMs);
	}

	async navigateToChat() {
		await this.chatLink.click();
	}

	async navigateToHome() {
		await this.homeLink.click();
	}
}
