import { test as base, type Locator } from '@playwright/test';

type Fixtures = {
	greeting: Locator;
	loginModal: Locator;
};

export const test = base.extend<Fixtures>({
	greeting: async ({ page }, use) => {
		const greeting = page.locator('text=/.*can I help you today?/i');
		await use(greeting);
	},
	loginModal: async ({ page }, use) => {
		const loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
		await use(loginModal);
	}
});

export { expect } from '@playwright/test';
