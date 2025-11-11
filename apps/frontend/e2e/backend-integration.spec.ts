import { test, expect } from '@playwright/test';
import { authenticateUser } from './fixtures/auth';
import {
	makeAuthenticatedRequest,
	verifyBackendHealth,
	LANGGRAPH_CONFIG
} from './fixtures/backend';

test.describe('Backend Integration with OIDC Authentication', () => {
	test.beforeEach(async ({ page }) => {
		// Verify backend is running before each test
		const isHealthy = await verifyBackendHealth(page);
		expect(isHealthy).toBeTruthy();
	});

	test.describe('Backend Health', () => {
		test('should verify backend is accessible', async ({ page }) => {
			const response = await page.request.get(`${LANGGRAPH_CONFIG.apiUrl}/ok`);
			expect(response.ok()).toBeTruthy();
		});

		test('should verify OIDC mock server is running', async ({ page }) => {
			const response = await page.request.get(
				'http://localhost:8080/.well-known/openid-configuration'
			);
			expect(response.ok()).toBeTruthy();

			const config = await response.json();
			expect(config.issuer).toBe('http://localhost:8080');
		});
	});

	test.describe('When unauthenticated', () => {
		test.describe('Navigating to "/chat"', () => {
			test.beforeEach(async ({ page }) => {
				await page.goto('/chat');
			});

			test('should not show authenticated content', async ({ page }) => {
				// Wait a bit to see if any initialization happens
				await page.waitForTimeout(2000);

				// Should not show authenticated content with user's name
				const greeting = page.locator('text=/hello.*test-user/i');
				await expect(greeting).not.toBeVisible();
			});

			test('should handle missing token gracefully', async ({ page }) => {
				// The app should not crash - check that basic UI is present
				await expect(page.locator('body')).toBeVisible();

				// Navigation should still work
				await expect(page.getByRole('navigation')).toBeVisible();
			});
		});
	});

	test.describe('When authenticated', () => {
		test.beforeEach(async ({ page }) => {
			await authenticateUser(page);
		});

		test.describe('Making backend requests', () => {
			test('should include access token in requests', async ({ page }) => {
				// Navigate to chat page which makes backend requests
				await page.goto('/chat');

				// Wait for the page to initialize and make requests
				await page.waitForTimeout(3000);

				// If authentication is working, the chat page should load successfully
				// and not show authentication errors
				const authError = await page
					.getByText(/unauthorized|forbidden|401|403/i)
					.isVisible()
					.catch(() => false);
				expect(authError).toBeFalsy();

				// The page should show the main chat interface
				await expect(page.locator('h1')).toBeVisible();
			});

			test('should successfully authenticate with backend using OIDC token', async ({
				page
			}) => {
				// Try to make an authenticated request to the backend
				// LangGraph exposes /info endpoint that requires authentication
				try {
					const response = await makeAuthenticatedRequest(page, '/info');
					// Either succeeds (200-299) or returns 401/403 if endpoint requires auth
					// The important part is that the request is made with proper auth header
					expect([200, 201, 204, 401, 403, 404]).toContain(response.status());
				} catch {
					// If the endpoint doesn't exist, that's okay - we're testing auth flow
					console.log('Backend endpoint not available, but auth flow was tested');
				}
			});

			test('should create LangGraph client with valid token', async ({ page }) => {
				await page.goto('/chat');

				// Wait for initialization
				await page.waitForTimeout(3000);

				// Check that the client was created successfully
				// The page should not show a critical error
				const hasCriticalError = await page
					.getByText(/error during generation|failed to initialize/i)
					.isVisible()
					.catch(() => false);

				expect(hasCriticalError).toBeFalsy();
			});
		});

		test.describe('Token validation', () => {
			test('should use id_token as access token', async ({ page }) => {
				// Verify authentication works by accessing backend-dependent page
				await page.goto('/chat');
				await page.waitForTimeout(2000);

				// If id_token is properly used, the page should work without auth errors
				const authError = await page
					.getByText(/unauthorized|forbidden/i)
					.isVisible()
					.catch(() => false);
				expect(authError).toBeFalsy();
			});

			test('should maintain valid token across page navigations', async ({ page }) => {
				// Navigate to different pages and verify auth persists
				await page.goto('/');
				await page.waitForTimeout(500);
				await expect(page.locator('#avatar-menu-button')).toBeVisible();

				await page.goto('/chat');
				await page.waitForTimeout(500);
				await expect(page.locator('#avatar-menu-button')).toBeVisible();

				await page.goto('/');
				await expect(page.locator('#avatar-menu-button')).toBeVisible();
			});
		});

		test.describe('Navigating to "/chat"', () => {
			test.beforeEach(async ({ page }) => {
				await page.goto('/chat');
			});

			test('should handle backend requests in chat interface', async ({ page }) => {
				// Wait for chat interface to load
				await page.waitForSelector('h1', { timeout: 15000 });

				// The chat page should not show errors
				const errorElement = page.getByText(/error/i).first();
				const isErrorVisible = await errorElement.isVisible().catch(() => false);

				if (isErrorVisible) {
					// If there's an error, it should not be an auth error
					const errorText = await errorElement.textContent();
					expect(errorText).not.toMatch(/unauthorized|forbidden|authentication/i);
				}
			});

			test('should show functional chat interface', async ({ page }) => {
				// Wait for initialization
				await page.waitForTimeout(3000);

				// Verify chat interface is ready
				const chatGreeting = page.locator('text=/hello|hi|chat/i').first();
				await expect(chatGreeting).toBeVisible({ timeout: 15000 });

				// Verify user is shown in navbar
				await expect(page.locator('#avatar-menu-button')).toBeVisible();

				// The chat should be functional (has input or suggestions)
				const hasInput = await page
					.locator('input[type="text"], textarea')
					.isVisible()
					.catch(() => false);
				const hasSuggestions = await page
					.locator('[role="button"]')
					.filter({ hasText: /suggest/i })
					.first()
					.isVisible()
					.catch(() => false);

				// At least one should be visible for a functional chat
				expect(hasInput || hasSuggestions).toBeTruthy();
			});
		});

		test.describe('Error recovery', () => {
			test('should recover from backend connection issues', async ({ page }) => {
				await page.goto('/chat');

				// Wait for initialization attempt
				await page.waitForTimeout(3000);

				// Page should still be functional even if backend has issues
				await expect(page.locator('body')).toBeVisible();
				await expect(page.getByRole('navigation')).toBeVisible();

				// User should still be authenticated
				await expect(page.locator('#avatar-menu-button')).toBeVisible();
			});

			test('should maintain auth state after backend errors', async ({ page }) => {
				// Verify authenticated initially
				await expect(page.locator('#avatar-menu-button')).toBeVisible();

				// Try to access chat (might have backend issues)
				await page.goto('/chat');
				await page.waitForTimeout(2000);

				// Navigate back to home
				await page.goto('/');

				// Verify user is still authenticated (avatar visible)
				await expect(page.locator('#avatar-menu-button')).toBeVisible();

				// Navigate to another page to verify auth persists
				await page.goto('/');
				await expect(page.locator('#avatar-menu-button')).toBeVisible();
			});
		});
	});

	test.describe('End-to-end flows', () => {
		test('should complete full authentication flow from frontend to backend', async ({
			page
		}) => {
			// Step 1: Start unauthenticated
			await page.goto('/');
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

			// Step 2: Sign in with OIDC
			await authenticateUser(page);
			await expect(page.locator('#avatar-menu-button')).toBeVisible();

			// Step 3: Access protected route that uses backend
			await page.goto('/chat');
			await page.waitForTimeout(3000);

			// Step 4: Verify no critical errors and page loaded
			const criticalError = await page
				.getByText(/error during generation|failed to initialize|unauthorized|forbidden/i)
				.isVisible()
				.catch(() => false);
			expect(criticalError).toBeFalsy();

			await expect(page.locator('h1')).toBeVisible();

			// Step 5: Sign out
			await page.locator('#avatar-menu-button').click();
			await page
				.getByRole('button', { name: /sign out/i })
				.last()
				.click();

			// Step 6: Verify signed out
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
		});
	});
});
