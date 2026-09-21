import type { Locator, Page } from '@playwright/test';

function signInRetryDelay(status: number, attempt: number, retryAfter: number): number | null {
	if (status !== 429 || attempt > 0) return null;
	if (!Number.isFinite(retryAfter)) return null;
	if (retryAfter < 0 || retryAfter > 10) return null;
	return retryAfter * 1000 + 100;
}

/**
 * AppPage encapsulates common app-wide elements: navigation and user menu.
 */
export class AppPage {
	readonly page: Page;

	readonly main: Locator;

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
		this.userMenuButton = this.header.getByRole('button', { name: 'User' });

		// Using this.header instead of .page here gives errors.
		this.signOutButton = page.getByRole('button', { name: 'Sign out' });

		this.main = this.page.getByRole('main');
	}

	async signIn(button: Locator = this.signInButton) {
		await this.waitForHydration();
		// Fast serial tests can exceed Better Auth's production sign-in limit.
		// Keep that protection enabled and honor one explicitly requested retry.
		for (let attempt = 0; attempt < 2; attempt++) {
			const [response] = await Promise.all([
				this.page.waitForResponse(
					(response) =>
						new URL(response.url()).pathname === '/api/auth/sign-in/social' &&
						response.request().method() === 'POST',
					{ timeout: 10_000 }
				),
				button.click()
			]);
			if (response.ok()) return;
			const retryAfter = Number(response.headers()['x-retry-after']);
			const retryDelay = signInRetryDelay(response.status(), attempt, retryAfter);
			if (retryDelay === null) {
				throw new Error(`Sign-in failed with HTTP ${response.status()}`);
			}
			await this.page.waitForTimeout(retryDelay);
		}
	}

	/**
	 * Sign out via user menu dropdown.
	 * Note: Includes intentional waits to handle dropdown timing.
	 */
	async signOut() {
		await this.userMenuButton.click();
		// Wait for dropdown to be in DOM and visible before clicking
		await this.signOutButton.waitFor({ state: 'visible' });
		await this.signOutButton.click();
		// Wait for sign-out to complete: URL changes and sign-in button appears
		await this.page.waitForURL('/');
		await this.signInButton.waitFor({ state: 'visible' });
	}

	async navigateToChat() {
		await this.chatLink.click();
	}

	async navigateToHome() {
		await this.homeLink.click();
	}

	/**
	 * Wait for SvelteKit client-side hydration to complete.
	 * The root layout adds a 'started' class to document.body via onMount,
	 * which only fires after hydration finishes.
	 */
	async waitForHydration() {
		await this.page.waitForSelector('body.started', { timeout: 15000 });
	}
}
