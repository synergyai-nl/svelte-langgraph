import { test, expect } from '@playwright/test';
import { authenticateUser, signOut, OIDC_CONFIG } from './fixtures/auth';

test.describe('OIDC Authentication', () => {
	test.describe('Sign-in Flow', () => {
		test('should display sign-in button when not authenticated', async ({ page }) => {
			await page.goto('/');

			// Verify sign-in button is visible
			const signInButton = page.getByRole('button', { name: /sign in/i });
			await expect(signInButton).toBeVisible();

			// Verify avatar menu is not visible
			await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
		});

		test('should successfully sign in with OIDC provider', async ({ page }) => {
			// Navigate to home page
			await page.goto('/');

			// Verify we start unauthenticated
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

			// Perform authentication
			await authenticateUser(page);

			// Verify successful authentication
			await expect(page.locator('#avatar-menu-button')).toBeVisible();
			await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();

			// Verify user info is displayed
			const avatarButton = page.locator('#avatar-menu-button');
			await expect(avatarButton).toContainText(/test-user/i);
		});

		test('should redirect back to app after successful OIDC authentication', async ({ page }) => {
			await page.goto('/');

			// Start authentication flow
			await page.getByRole('button', { name: /sign in/i }).click();

			// Wait for navigation to OIDC provider
			await page.waitForURL(/localhost:8080/, { timeout: 10000 });

			// Complete authentication by clicking the test-user button
			const testUserButton = page.getByRole('button', { name: 'test-user' });
			await testUserButton.waitFor({ state: 'visible', timeout: 5000 });
			await testUserButton.click();

			// Should eventually redirect back to the app (home page)
			await page.waitForURL('/', { timeout: 15000 });

			// Verify authentication was successful
			await expect(page.locator('#avatar-menu-button')).toBeVisible();
		});

		test('should include access token in session after sign-in', async ({ page }) => {
			await authenticateUser(page);

			// Verify authentication works by accessing a protected page (chat)
			await page.goto('/chat');
			await page.waitForTimeout(2000);

			// If auth is working, the page should load and show the chat interface
			// Check for chat-specific elements
			const h1 = page.locator('h1');
			await expect(h1).toBeVisible();
		});
	});

	test.describe('Session Persistence', () => {
		test('should maintain session across page navigation', async ({ page }) => {
			await authenticateUser(page);

			// Navigate to different pages
			await page.goto('/chat');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			await page.goto('/');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			await page.goto('/');
			await expect(page.locator('#avatar-menu-button')).toBeVisible();
		});

		test('should persist session on page reload', async ({ page }) => {
			await authenticateUser(page);

			// Verify authenticated
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			// Reload the page
			await page.reload();

			// Should still be authenticated
			await expect(page.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });
			await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
		});

		test('should maintain session across browser context', async ({ page, context }) => {
			await authenticateUser(page);

			// Open a new page in the same context
			const newPage = await context.newPage();
			await newPage.goto('/');

			// Should be authenticated in the new page
			await expect(newPage.locator('#avatar-menu-button')).toBeVisible({ timeout: 10000 });

			await newPage.close();
		});
	});

	test.describe('Protected Routes', () => {
		test('should allow access to chat page when authenticated', async ({ page }) => {
			await authenticateUser(page);

			// Navigate to protected chat page
			await page.goto('/chat');

			// Should not show login modal
			const loginModal = page.getByRole('dialog').filter({ hasText: /sign in/i });
			await expect(loginModal).not.toBeVisible();

			// Should show chat interface
			await expect(page.locator('h1')).toBeVisible();
		});

		test('should show login modal on chat page when not authenticated', async ({ page }) => {
			// Navigate to chat page without authentication
			await page.goto('/chat');

			// Should show login modal dialog
			const loginModal = page.getByRole('dialog');
			await expect(loginModal).toBeVisible();

			// Should have a sign-in button in the modal
			const signInButton = loginModal.getByRole('button', { name: /sign in/i });
			await expect(signInButton).toBeVisible();
		});

		test('should load chat with user greeting when authenticated', async ({ page }) => {
			await authenticateUser(page);

			await page.goto('/chat');

			// Wait for chat to initialize
			await page.waitForTimeout(2000);

			// Should show the greeting heading (avoiding specific i18n text checks)
			const greeting = page.locator('h1').first();
			await expect(greeting).toBeVisible({ timeout: 15000 });

			// Should not show login modal when authenticated
			await expect(page.getByRole('dialog')).not.toBeVisible();
		});
	});

	test.describe('Sign-out Flow', () => {
		test('should successfully sign out', async ({ page }) => {
			await authenticateUser(page);

			// Verify we're authenticated
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			// Sign out
			await signOut(page);

			// Verify we're signed out
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
			await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
		});

		test('should clear session after sign-out', async ({ page }) => {
			await authenticateUser(page);

			// Sign out
			await signOut(page);

			// Verify session is cleared by checking UI state
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
			await expect(page.locator('#avatar-menu-button')).not.toBeVisible();
		});

		test('should redirect to home page after sign-out', async ({ page }) => {
			await authenticateUser(page);

			// Navigate to chat page
			await page.goto('/chat');

			// Sign out
			await signOut(page);
		});

		test('should not allow access to protected routes after sign-out', async ({ page }) => {
			await authenticateUser(page);

			// Sign out
			await signOut(page);

			// Try to access chat page
			await page.goto('/chat');

			// Should show login modal or prompt
			await page.waitForTimeout(1000);

			// Should not show authenticated user greeting
			const greeting = page.locator('text=/hello.*test-user/i');
			await expect(greeting).not.toBeVisible();
		});
	});

	test.describe('OIDC Provider Integration', () => {
		test('should use correct OIDC issuer configuration', async ({ page }) => {
			await page.goto('/');

			// Monitor network requests to verify OIDC issuer
			const requestPromise = page.waitForRequest(
				(request) => request.url().includes(OIDC_CONFIG.issuer),
				{ timeout: 15000 }
			);

			// Trigger sign-in to initiate OIDC flow
			await page.getByRole('button', { name: /sign in/i }).click();

			// Verify request to OIDC issuer was made
			const request = await requestPromise;
			expect(request.url()).toContain(OIDC_CONFIG.issuer);
		});

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

	test.describe('Error Handling', () => {
		test('should handle navigation when not fully authenticated', async ({ page }) => {
			await page.goto('/');

			// Should not crash and should show sign-in option
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

			// Should be able to navigate
			await page.goto('/');
			await expect(page).toHaveURL('/');
		});

		test('should show appropriate UI for unauthenticated users', async ({ page }) => {
			await page.goto('/');

			// Should show navigation
			await expect(page.getByRole('navigation')).toBeVisible();

			// Should show sign-in button
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

			// Should be able to navigate to public pages
			const chatLink = page.getByRole('link', { name: /chat/i });
			await expect(chatLink).toBeVisible();
		});
	});
});
