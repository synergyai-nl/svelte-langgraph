import { test, expect, OIDC_CONFIG } from './fixtures';

test.describe('OIDC Provider', () => {
	test('should handle OIDC well-known configuration', async ({ oidcPage }) => {
		const config = await oidcPage.verifyWellKnownConfig();
		expect(config.issuer).toBe(OIDC_CONFIG.issuer);
	});
});

test.describe('When unauthenticated', () => {
	test.describe('On home page', () => {
		test.beforeEach(async ({ homePage }) => {
			await homePage.goto();
		});

		test('should display sign-in button', async ({ authHelpers }) => {
			await authHelpers.expectUnauthenticated();
		});

		test('should successfully sign in with OIDC provider', async ({ authHelpers, homePage }) => {
			// Perform authentication
			await authHelpers.authenticateUser();

			// Verify successful authentication
			await authHelpers.expectAuthenticated();

			// Verify user info is displayed
			await expect(homePage.avatarMenuButton).toContainText(/test-user/i);
		});
	});

	test.describe('On chat page', () => {
		test.beforeEach(async ({ chatPage }) => {
			await chatPage.goto();
		});

		test('should show login modal', async ({ chatPage }) => {
			await expect(chatPage.loginModal).toBeVisible();
		});

		test('should have a sign-in button in the modal', async ({ chatPage }) => {
			await expect(chatPage.loginModalSignInButton).toBeVisible();
		});

		test('should not show greeting', async ({ chatPage }) => {
			await expect(chatPage.greeting).not.toBeVisible();
		});

		test('should have navigation and body visible', async ({ page }) => {
			// The app should not crash - check that basic UI is present
			await expect(page.locator('body')).toBeVisible();

			// Navigation should still work
			await expect(page.getByRole('navigation')).toBeVisible();
		});
	});
});

test.describe('When authenticated', () => {
	test.beforeEach(async ({ authHelpers }) => {
		await authHelpers.authenticateUser();
	});

	test.describe('Session persistence', () => {
		[{ location: '/' }, { location: '/chat' }].forEach(({ location }) => {
			test(`should persist across navigation to ${location}`, async ({ page, authHelpers }) => {
				await page.goto(location);
				await authHelpers.expectAuthenticated();
			});
		});

		test('should persist session on page reload', async ({ page, authHelpers }) => {
			// Reload the page
			await page.reload();

			// Should still be authenticated
			await authHelpers.expectAuthenticated();
		});

		test('should maintain session across browser context', async ({ context }) => {
			// Open a new page in the same context
			const newPage = await context.newPage();
			await newPage.goto('/');

			// Create a HomePage instance for the new page to check auth status
			const { HomePage } = await import('./pages');
			const newHomePage = new HomePage(newPage);

			// Should be authenticated in the new page
			await expect(newHomePage.avatarMenuButton).toBeVisible();
			await expect(newHomePage.signInButton).not.toBeVisible();

			await newPage.close();
		});
	});

	test.describe('On chat page', () => {
		test.beforeEach(async ({ chatPage }) => {
			await chatPage.goto();
		});

		test('should not show login modal', async ({ chatPage }) => {
			await expect(chatPage.loginModal).not.toBeVisible();
		});

		test('should show chat interface', async ({ chatPage }) => {
			await chatPage.waitForChatInterface();
			await expect(chatPage.chatTitle).toBeVisible();
		});

		test('should show greeting', async ({ chatPage }) => {
			await expect(chatPage.greeting).toBeVisible();
		});

		test.describe('Signing out from chat', () => {
			test('should navigate to home after sign out', async ({ authHelpers, page }) => {
				await authHelpers.signOut();
				await expect(page).toHaveURL('/');
			});
		});
	});

	test.describe('Signing out', () => {
		test.beforeEach(async ({ authHelpers }) => {
			await authHelpers.signOut();
		});

		test('should show unauthenticated state', async ({ authHelpers }) => {
			await authHelpers.expectUnauthenticated();
		});

		test('should show login modal on chat page after sign out', async ({ chatPage }) => {
			await chatPage.goto();
			await expect(chatPage.loginModal).toBeVisible();
		});
	});
});
