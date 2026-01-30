import type { Locator, Page } from '@playwright/test';

/**
 * ChatPage encapsulates elements specific to the /chat route.
 */
export class ChatPage {
	readonly page: Page;

	// Chat elements
	readonly textInput: Locator;

	// Login modal (shown when unauthenticated)
	readonly loginModal: Locator;
	readonly modalSignInButton: Locator;

	constructor(page: Page) {
		this.page = page;

		this.textInput = page.getByRole('textbox', { name: 'Message...' });

		this.loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.modalSignInButton = this.loginModal.getByText('Sign in', { exact: true });
	}
}
