import { test as base } from '@playwright/test';

type Fixtures = {
	greeting: Locator;
	loginModal: Locator;
};

export const test = base.extend<Fixtures>({
	greeting: async ({ page }, use) => {
		const greeting = await page.locator('text=/.*can I help you today?/i');
		await use(greeting);
	},
	loginModal: async ({ page }, use) => {
		const loginModal = await page.getByRole('dialog').filter({ hasText: /sign in/i });
		await use(loginModal);
	}
});

export { expect } from '@playwright/test';
