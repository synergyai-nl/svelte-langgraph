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
}
