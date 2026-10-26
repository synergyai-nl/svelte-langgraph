import type { Locator } from '@playwright/test';
import { AppPage } from './app.page';
import { ChatSurfacePage } from './chat-surface.page';

/**
 * ChatPage encapsulates elements specific to the /chat route: the chat surface mounted in
 * `app.main` (composer + messages, inherited from ChatSurfacePage) plus route chrome.
 */
export class ChatPage extends ChatSurfacePage {
	readonly app: AppPage;

	// Phase state field (data-testid="state-field-phase")
	readonly phaseWrapper: Locator;
	readonly phaseSelect: Locator;

	// Loading skeleton shown while thread history is being fetched (data-testid="chat-history-loading")
	readonly historyLoading: Locator;

	// Login modal (shown when unauthenticated)
	readonly loginModal: Locator;
	readonly modalSignInButton: Locator;

	constructor(app: AppPage) {
		super(app.main);
		this.app = app;

		// Phase dropdown — rendered by StateField when schema includes a 'phase' enum field
		this.phaseWrapper = app.page.locator('[data-testid="state-field-phase"]');
		this.phaseSelect = app.page.locator('#state-field-input-phase');

		this.historyLoading = app.page.locator('[data-testid="chat-history-loading"]');

		this.loginModal = app.page.getByRole('dialog').filter({ hasText: /sign in/i });
		this.modalSignInButton = this.loginModal.getByText('Continue with SSO', { exact: true });
	}

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

	/** The thumbs-up / thumbs-down buttons belonging to one AI message (pass one of the
	 *  inherited `aiMessages` / `aiMessage()` locators).
	 *  Actions only become visible on hover, so hover before clicking. */
	feedbackButtons(aiMessage: Locator): { up: Locator; down: Locator } {
		return {
			up: aiMessage.getByTitle('Good Response'),
			down: aiMessage.getByTitle('Bad Response')
		};
	}
}
