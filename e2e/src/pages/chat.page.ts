import type { Locator } from '@playwright/test';
import { AppPage } from './app.page';

/**
 * ChatPage encapsulates elements specific to the /chat route.
 */
export class ChatPage {
	readonly app: AppPage;

	// Chat elements
	readonly textInput: Locator;

	// Login modal (shown when unauthenticated)
	readonly loginModal: Locator;
	readonly modalSignInButton: Locator;

	constructor(app: AppPage) {
		this.app = app;

		this.textInput = app.main.getByRole('textbox', { name: 'Message...' });

		this.loginModal = app.page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.modalSignInButton = this.loginModal.getByText('Sign in', { exact: true });
	}
}
