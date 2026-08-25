import type { Locator } from '@playwright/test';
import { AppPage } from './app.page';

/**
 * ChatPage encapsulates elements specific to the /chat route.
 */
export class ChatPage {
	readonly app: AppPage;

	// Chat elements
	readonly textInput: Locator;

	// Phase state field (data-testid="state-field-phase")
	readonly phaseWrapper: Locator;
	readonly phaseSelect: Locator;

	// Loading skeleton shown while thread history is being fetched (data-testid="chat-history-loading")
	readonly historyLoading: Locator;

	// Login modal (shown when unauthenticated)
	readonly loginModal: Locator;
	readonly modalSignInButton: Locator;

	/** Every rendered AI message card. Rating buttons are scoped per-message. */
	readonly aiMessages: Locator;

	constructor(app: AppPage) {
		this.app = app;

		this.textInput = app.main.getByRole('textbox', { name: 'Ask your agent…' });

		// Phase dropdown — rendered by StateField when schema includes a 'phase' enum field
		this.phaseWrapper = app.page.locator('[data-testid="state-field-phase"]');
		this.phaseSelect = app.page.locator('#state-field-input-phase');

		this.historyLoading = app.page.locator('[data-testid="chat-history-loading"]');

		this.loginModal = app.page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.modalSignInButton = this.loginModal.getByText('Continue with SSO', { exact: true });

		this.aiMessages = app.page.getByRole('group').filter({ has: app.page.locator('.prose') });
	}

	/** The thumbs-up / thumbs-down buttons belonging to one AI message.
	 *  Actions only become visible on hover, so hover before clicking. */
	feedbackButtons(aiMessage: Locator): { up: Locator; down: Locator } {
		return {
			up: aiMessage.getByTitle('Good Response'),
			down: aiMessage.getByTitle('Bad Response')
		};
	}
}
