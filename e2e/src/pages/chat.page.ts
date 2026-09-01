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

	/** Every rendered AI message (data-testid="message-ai"). Rating buttons are
	 *  scoped per-message, so pass one of these to `feedbackButtons`. */
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

		this.aiMessages = app.page.locator('[data-testid="message-ai"]');
	}

	/** The thumbs-up / thumbs-down buttons belonging to one AI message.
	 *  Actions only become visible on hover, so hover before clicking. */
	/** The comment box a rating click opens. The rating is not sent until this
	 *  resolves, so every rating in a test has to go through it. */
	get feedbackDialog(): Locator {
		return this.app.page.getByTestId('feedback-dialog');
	}

	get feedbackComment(): Locator {
		return this.app.page.getByTestId('feedback-comment');
	}

	get feedbackSubmit(): Locator {
		return this.app.page.getByTestId('feedback-submit');
	}

	get feedbackCancel(): Locator {
		return this.app.page.getByTestId('feedback-cancel');
	}

	feedbackButtons(aiMessage: Locator): { up: Locator; down: Locator } {
		return {
			up: aiMessage.getByTitle('Good Response'),
			down: aiMessage.getByTitle('Bad Response')
		};
	}
}
