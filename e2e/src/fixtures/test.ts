import { test as base } from '@playwright/test';
import { AppPage, ChatPage, OidcPage } from '../pages';

type Fixtures = {
	app: AppPage;
	chat: ChatPage;
	oidc: OidcPage;
};

export const test = base.extend<Fixtures>({
	page: async ({ page }, use) => {
		const waitForHydration = () => page.waitForSelector('body.started', { timeout: 15000 });

		const originalGoto = page.goto.bind(page);
		page.goto = async (url, options) => {
			const response = await originalGoto(url, options);
			// Only wait for hydration on local SvelteKit pages
			if (typeof url === 'string' && url.startsWith('/')) {
				await waitForHydration();
			}
			return response;
		};

		const originalReload = page.reload.bind(page);
		page.reload = async (options) => {
			const response = await originalReload(options);
			await waitForHydration();
			return response;
		};

		const originalWaitForURL = page.waitForURL.bind(page);
		page.waitForURL = async (url, options) => {
			const response = await originalWaitForURL(url, options);
			await waitForHydration();
			return response;
		};

		await use(page);
	},
	app: async ({ page }, use) => {
		await use(new AppPage(page));
	},
	chat: async ({ app }, use) => {
		await use(new ChatPage(app));
	},
	oidc: async ({ page }, use) => {
		await use(new OidcPage(page));
	}
});

export { expect } from '@playwright/test';
