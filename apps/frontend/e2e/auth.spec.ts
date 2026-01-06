import {
	authenticateUser,
	expectAuthenticated,
	expectUnauthenticated,
	OIDC_CONFIG,
	signOut
} from './fixtures/auth';
import { expect, test } from './fixtures/test';

test.describe('OIDC Provider', () => {
	test('should handle OIDC well-known configuration', async ({ page }) => {
		const response = await page.request.get(
			`${OIDC_CONFIG.issuer}/.well-known/openid-configuration`
		);

		expect(response.ok()).toBeTruthy();

		const config = await response.json();
		expect(config.issuer).toBe(OIDC_CONFIG.issuer);
		expect(config.authorization_endpoint).toBeTruthy();
		expect(config.token_endpoint).toBeTruthy();
	});
});

test.describe('When unauthenticated', () => {
	test.describe('On "/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/');
		});

		test('should display sign-in button', async ({ page }) => {
			await expectUnauthenticated(page);
		});

		test('should successfully sign in with OIDC provider', async ({ page, app }) => {
			await authenticateUser(page);
			await expectAuthenticated(page);
			await expect(app.userMenuButton).toBeVisible();
		});
	});

	test.describe('On "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat');
		});

		test('should show login modal', async ({ chat }) => {
			await expect(chat.loginModal).toBeVisible();
		});

		test('should have a sign-in button in the modal', async ({ chat }) => {
			await expect(chat.modalSignInButton).toBeVisible();
		});

		test('should not show greeting', async ({ chat }) => {
			await expect(chat.textInput).not.toBeVisible();
		});

		test('should have navigation visible', async ({ app }) => {
			await expect(app.nav).toBeVisible();
		});
	});
});

test.describe('When authenticated', () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
	});

	test.describe('Session', () => {
		[{ location: '/' }, { location: '/chat' }].forEach(({ location }) => {
			test(`should persist across navigation to ${location}`, async ({ page }) => {
				await page.goto(location);
				await expectAuthenticated(page);
			});
		});

		test('should persist session on page reload', async ({ page }) => {
			await page.reload();
			await expectAuthenticated(page);
		});

		test('should maintain session across browser context', async ({ context }) => {
			const newPage = await context.newPage();
			await newPage.goto('/');
			await expectAuthenticated(newPage);
			await newPage.close();
		});
	});

	test.describe('On "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat/');
		});

		test('should not show login modal', async ({ chat }) => {
			await expect(chat.loginModal).not.toBeVisible();
		});

		test('should have text input enabled', async ({ chat }) => {
			await expect(chat.textInput).toBeEnabled();
		});

		test.describe('Signing out', () => {
			test.beforeEach(async ({ page }) => {
				await signOut(page);
			});

			test('should navigate to "/"', async ({ page }) => {
				await expect(page).toHaveURL('/');
			});
		});
	});

	test.describe('Signing out', () => {
		test.beforeEach(async ({ page }) => {
			await signOut(page);
		});

		test('should show unauthenticated state', async ({ page }) => {
			await expectUnauthenticated(page);
		});

		test.describe('On "/chat/"', () => {
			test.beforeEach(async ({ page }) => {
				await page.goto('/chat/');
			});

			test('should show login modal', async ({ chat }) => {
				await expect(chat.loginModal).toBeVisible();
			});
		});
	});
});

test.describe('Navigation', () => {
	test('navbar has home and chat links', async ({ page, app }) => {
		await page.goto('/');
		await expect(app.homeLink).toBeVisible();
		await expect(app.chatLink).toBeVisible();
	});

	test('clicking chat link navigates to chat page', async ({ page, app }) => {
		await page.goto('/');
		await app.navigateToChat();
		await expect(page).toHaveURL(/.*chat.*/);
	});
});
