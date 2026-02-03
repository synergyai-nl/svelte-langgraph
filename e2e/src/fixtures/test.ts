import { test as base } from '@playwright/test';
import { AppPage, ChatPage, OidcPage } from '../pages';

type Fixtures = {
	app: AppPage;
	chat: ChatPage;
	oidc: OidcPage;
};

export const test = base.extend<Fixtures>({
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
