import { type Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Home Page Object Model
 * Encapsulates the home page (/) interactions and elements
 * Extends BasePage for common navigation and auth functionality
 */
export class HomePage extends BasePage {
	constructor(page: Page) {
		super(page);
	}

	/**
	 * Navigate to the home page
	 */
	async goto() {
		await this.page.goto('/');
	}
}
