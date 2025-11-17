import { type Page, type Locator } from '@playwright/test';

/**
 * Chat Page Object Model
 * Encapsulates the chat page (/chat) interactions and elements
 */
export class ChatPage {
	readonly page: Page;
	readonly loginModal: Locator;
	readonly loginModalSignInButton: Locator;
	readonly greeting: Locator;
	readonly chatTitle: Locator;
	readonly errorMessage: Locator;
	readonly authErrorMessage: Locator;
	readonly criticalErrorMessage: Locator;

	constructor(page: Page) {
		this.page = page;

		// Login modal elements
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
	 * Check if login modal is visible
	 */
	async isLoginModalVisible(): Promise<boolean> {
		return await this.loginModal.isVisible();
	}

	/**
	 * Check if greeting is visible
	 */
	async isGreetingVisible(): Promise<boolean> {
		return await this.greeting.isVisible();
	}

	/**
	 * Wait for chat interface to load
	 */
	async waitForChatInterface(timeout = 15000) {
		await this.chatTitle.waitFor({ state: 'visible', timeout });
	}

	/**
	 * Check if authentication error is visible
	 */
	async hasAuthError(): Promise<boolean> {
		return await this.authErrorMessage.isVisible().catch(() => false);
	}

	/**
	 * Check if critical error is visible
	 */
	async hasCriticalError(): Promise<boolean> {
		return await this.criticalErrorMessage.isVisible().catch(() => false);
	}

	/**
	 * Get error text if visible
	 */
	async getErrorText(): Promise<string | null> {
		const isVisible = await this.errorMessage.isVisible().catch(() => false);
		if (isVisible) {
			return await this.errorMessage.textContent();
		}
		return null;
	}

	/**
	 * Check if the page shows the main chat interface
	 */
	async isChatInterfaceReady(): Promise<boolean> {
		return await this.chatTitle.isVisible();
	}
}
