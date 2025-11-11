import { test, expect } from '@playwright/test';
import type { Request } from '@playwright/test';
import { authenticateUser, signOut, OIDC_CONFIG } from './fixtures/auth';

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
	test.describe('On the home page', async () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/');
		});

		test('should display sign-in button', async ({ page }) => {
			const signInButton = page.getByRole('button', { name: /sign in/i });
			await expect(signInButton).toBeVisible();

			// Verify avatar menu is not visible
			await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
		});

		test('should successfully sign in with OIDC provider', async ({ page }) => {
			// Perform authentication
			await authenticateUser(page);

			// Verify successful authentication
			await expect(page.locator('#avatar-menu-button')).toBeVisible();
			await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();

			// Verify user info is displayed
			const avatarButton = page.locator('#avatar-menu-button');
			await expect(avatarButton).toContainText(/test-user/i);
		});

		test.describe('Clicking sign-in button', () => {
			let requestPromise: Promise<Request>;

			test.beforeEach(async ({ page }) => {
				// Monitor network requests to verify OIDC issuer
				requestPromise = page.waitForRequest(
					(request) => request.url().includes(OIDC_CONFIG.issuer),
					{ timeout: 15000 }
				);

				// Trigger sign-in to initiate OIDC flow
				await page.getByRole('button', { name: /sign in/i }).click();
			});

			test('should redirect to URL containing issuer', async () => {
				const request = await requestPromise;
				expect(request.url()).toContain(OIDC_CONFIG.issuer);
			});

			test.describe('Clicking the test-user button in OIDC provider', () => {
				test.beforeEach(async ({ page }) => {
					// Wait for navigation to OIDC provider
					await page.waitForURL(`${OIDC_CONFIG.issuer}/**`, { timeout: 10000 });

					const testUserButton = page.getByRole('button', { name: 'test-user' });
					await testUserButton.waitFor({ state: 'visible', timeout: 5000 });
					await testUserButton.click();
				});

				test('should redirect back to app', async ({ page }) => {
					await expect(page).toHaveURL('/');
				});

				test('should show avatar button', async ({ page }) => {
					await expect(page.locator('#avatar-menu-button')).toBeVisible();
				});
			});
		});
	});

	test.describe('Navigating to "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat');
		});

		test('should show login modal with sign-in button', async ({ page }) => {
			// Should show login modal dialog
			const loginModal = page.getByRole('dialog');
			await expect(loginModal).toBeVisible();

			// Should have a sign-in button in the modal
			const signInButton = loginModal.getByRole('button', { name: /sign in/i });
			await expect(signInButton).toBeVisible();
		});
	});
});

test.describe('When authenticated', async () => {
	test.beforeEach(async ({ page }) => {
		await authenticateUser(page);
	});

	test('avatar should be visible', async ({ page }) => {
		await expect(page.locator('#avatar-menu-button')).toBeVisible();
	});

	test.describe('Session', () => {
		test('should persist across page navigation', async ({ page }) => {
			// Navigate to different pages
			await page.goto('/chat');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			await page.goto('/');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			await page.goto('/');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();
		});

		test('should persist session on page reload', async ({ page }) => {
			// Verify authenticated
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			// Reload the page
			await page.reload();

			// Should still be authenticated
			await expect(page.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });
			await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
		});

		test('should maintain session across browser context', async ({ context }) => {
			// Open a new page in the same context
			const newPage = await context.newPage();
			await newPage.goto('/');

			// Should be authenticated in the new page
			await expect(newPage.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });

			await newPage.close();
		});
	});

	test.describe('Navigating to "/chat/"', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/chat');
		});

		test('should not show login modal', async ({ page }) => {
			// Should not show login modal
			const loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
			await expect(loginModal).not.toBeVisible();
		});

		test('should show chat interface', async ({ page }) => {
			await expect(page.locator('h1')).toBeVisible();
		});

		test('should show the greeting heading (avoiding specific i18n text checks)', async ({
			page
		}) => {
			const greeting = page.locator('h1').first();
			await expect(greeting).toBeVisible({ timeout: 15000 });
		});

		test.describe('Signing out', () => {
			test.beforeEach(async ({ page }) => {
				await signOut(page);
			});

			test('should redirect to "/"', async ({ page }) => {
				await expect(page).toHaveURL('/');
			});
		});
	});

	test.describe('Signing out', () => {
		test.beforeEach(async ({ page }) => {
			await signOut(page);
		});

		test('should make sign in button invisible', async ({ page }) => {
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
		});

		test('should make avatar invisible', async ({ page }) => {
			await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
		});

		test('should not show user greeting on "/chat"', async ({ page }) => {
			await page.goto('/chat');

			// Should not show authenticated user greeting
			const greeting = page.locator('text=/hello.*test-user/i');
			await expect(greeting).not.toBeVisible();
		});
	});
});
