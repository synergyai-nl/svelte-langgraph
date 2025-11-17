import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Chat Page Object Model
 * Encapsulates the chat page (/chat) interactions and elements
 * Extends BasePage for common navigation/auth + adds chat layout elements
 */
export class ChatPage extends BasePage {
	// Chat layout specific - login modal
	readonly loginModal: Locator;
	readonly loginModalSignInButton: Locator;

	// Chat interface elements
	readonly greeting: Locator;
	readonly chatTitle: Locator;

	// Error elements
	readonly errorMessage: Locator;
	readonly authErrorMessage: Locator;
	readonly criticalErrorMessage: Locator;

	constructor(page: Page) {
		super(page);

		// Login modal elements (chat layout specific)
		this.loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.loginModalSignInButton = this.loginModal.getByRole('button', { name: /sign in/i });

		// Chat interface elements
		this.greeting = page.locator('text=/.*can I help you today?/i');
		this.chatTitle = page.locator('h1');

		// Error elements
		this.errorMessage = page.getByText(/error/i).first();
		this.authErrorMessage = page.getByText(/unauthorized|forbidden|401|403/i);
		this.criticalErrorMessage = page.getByText(
			/error during generation|failed to initialize|unauthorized|forbidden/i
		);
	}

	/**
	 * Navigate to the chat page
	 */
	async goto() {
		await this.page.goto('/chat/');
	}

	/**
	 * Wait for chat interface to load
	 */
	async waitForChatInterface(timeout = 15000) {
		await this.chatTitle.waitFor({ state: 'visible', timeout });
	}
}
