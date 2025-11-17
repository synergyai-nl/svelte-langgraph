import { test as base } from '@playwright/test';
import { HomePage, ChatPage, OIDCPage } from '../pages';

/**
 * Page fixture types
 */
type PageFixtures = {
	homePage: HomePage;
	chatPage: ChatPage;
	oidcPage: OIDCPage;
};

/**
 * Extend base test with page object fixtures
 * These fixtures provide on-demand access to page objects
 */
export const test = base.extend<PageFixtures>({
	homePage: async ({ page }, use) => {
		const homePage = new HomePage(page);
		await use(homePage);
	},

	chatPage: async ({ page }, use) => {
		const chatPage = new ChatPage(page);
		await use(chatPage);
	},

	oidcPage: async ({ page }, use) => {
		const oidcPage = new OIDCPage(page);
		await use(oidcPage);
	}
});

export { expect } from '@playwright/test';
