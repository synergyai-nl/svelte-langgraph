import type { Locator, Page } from '@playwright/test';

/**
 * ChatPage encapsulates elements specific to the /chat route.
 */
export class ChatPage {
	readonly page: Page;

	// Chat elements
	readonly heading: Locator;
	readonly greeting: Locator;

	// Login modal (shown when unauthenticated)
	readonly loginModal: Locator;
	readonly modalSignInButton: Locator;

	constructor(page: Page) {
		this.page = page;

		this.heading = page.locator('h1');
		this.greeting = page.locator('text=/.*can I help you today?/i');

		this.loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.modalSignInButton = this.loginModal.getByText('Sign in', { exact: true });
	}
}
