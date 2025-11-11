import { test, expect } from './fixtures/test';
import {
	authenticateUser,
	signOut,
	OIDC_CONFIG,
	expectAuthenticated,
	expectUnauthenticated
} from './fixtures/auth';

test.describe('OIDC Provider', () => {
	test('should handle OIDC well-known configuration', async ({ page }) => {
		// Verify the well-known endpoint is accessible
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

test.describe('When unauthenticated', async () => {
	test.describe('On "/"', async () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/');
		});

		test('should display sign-in button', async ({ page }) => {
			await expectUnauthenticated(page);
		});

		test('should successfully sign in with OIDC provider', async ({ page }) => {
			// Perform authentication
			await authenticateUser(page);

			// Verify successful authentication
			await expectAuthenticated(page);

			// Verify user info is displayed
			const avatarButton = page.locator('#avatar-menu-button');
			await expect(avatarButton).toContainText(/test-user/i);
		});
	});

	test.describe('On "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat');
		});

		test('should show login modal', async ({ loginModal }) => {
			await expect(loginModal).toBeVisible();
		});

		test('should have a sign-in button in the modal', async ({ loginModal }) => {
			const signInButton = loginModal.getByRole('button', { name: /sign in/i });
			await expect(signInButton).toBeVisible();
		});

		test('should not show greeting', async ({ greeting }) => {
			await expect(greeting).not.toBeVisible();
		});

		test('should have navigation and body visible', async ({ page }) => {
			// The app should not crash - check that basic UI is present
			await expect(page.locator('body')).toBeVisible();

			// Navigation should still work
			await expect(page.getByRole('navigation')).toBeVisible();
		});
	});
});

test.describe('When authenticated', async () => {
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
			// Reload the page
			await page.reload();

			// Should still be authenticated
			await expectAuthenticated(page);
		});

		test('should maintain session across browser context', async ({ context }) => {
			// Open a new page in the same context
			const newPage = await context.newPage();
			await newPage.goto('/');

			// Should be authenticated in the new page
			await expectAuthenticated(newPage);

			await newPage.close();
		});
	});

	test.describe('On "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat');
		});

		test('should not show login modal', async ({ loginModal }) => {
			await expect(loginModal).not.toBeVisible();
		});

		test('should show chat interface', async ({ page }) => {
			await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
		});

		test('should show greeting', async ({ greeting }) => {
			await expect(greeting).toBeVisible();
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

			test('should show login modal', async ({ loginModal }) => {
				await expect(loginModal).toBeVisible();
			});
		});
	});
});
