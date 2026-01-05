import { test, expect } from '@playwright/test';
import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';

// langgraph-api converts all auth errors to 403 due to a bug in its middleware.
// See: https://github.com/langchain-ai/langgraph/issues/6552
// The issue: langgraph_api/auth/custom.py converts Auth.exceptions.HTTPException
// to Starlette's AuthenticationError (losing status_code), then middleware.py's
// on_error handler always returns 403 regardless of the original status code.
// We accept both 401 (correct) and 403 (current langgraph-api behavior) until fixed.
const AUTH_ERROR_CODES = [401, 403];

// Helper to create forged JWT with alg:none attack
function createForgedJWT(payload: Record<string, unknown>): string {
	const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const body = btoa(
		JSON.stringify({
			sub: 'attacker',
			iss: 'http://localhost:8080',
			exp: Math.floor(Date.now() / 1000) + 3600,
			...payload
		})
	)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	return `${header}.${body}.`; // Empty signature
}

// Helper to create tampered JWT with fake signature
function createTamperedJWT(payload: Record<string, unknown>): string {
	const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const body = btoa(
		JSON.stringify({
			sub: 'admin', // Privilege escalation attempt
			iss: 'http://localhost:8080',
			exp: Math.floor(Date.now() / 1000) + 3600,
			...payload
		})
	)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const fakeSig = btoa('fake_signature').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `${header}.${body}.${fakeSig}`;
}

test.describe('Backend Integration', () => {
	test.describe('Health', () => {
		test('should be accessible', async ({ page }) => {
			const response = await page.request.get(`${LANGGRAPH_CONFIG.apiUrl}/ok`);
			expect(response.ok()).toBeTruthy();
		});
	});

	test.describe('JWT Security', () => {
		test('should accept valid token from OIDC provider', async ({ page }) => {
			// Authenticate via OIDC to get a valid token
			await authenticateUser(page);

			// Capture the access token from an outgoing request to the backend
			let capturedToken: string | null = null;
			await page.route(`${LANGGRAPH_CONFIG.apiUrl}/**`, async (route) => {
				const headers = route.request().headers();
				const authHeader = headers['authorization'];
				if (authHeader?.startsWith('Bearer ')) {
					capturedToken = authHeader.substring(7);
				}
				await route.continue();
			});

			// Navigate to /chat which triggers authenticated backend requests
			await page.goto('/chat');
			await page.waitForResponse(
				(response) =>
					response.url().startsWith(LANGGRAPH_CONFIG.apiUrl) && response.status() === 200
			);

			expect(capturedToken).toBeTruthy();

			// Now use the captured token to make a direct request to verify it works
			const response = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
				headers: {
					Authorization: `Bearer ${capturedToken}`,
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(response.ok()).toBeTruthy();
			expect(response.status()).toBe(200);
		});

		test('should reject forged JWT with alg:none', async ({ page }) => {
			const forgedToken = createForgedJWT({ sub: 'attacker' });

			const response = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
				headers: {
					Authorization: `Bearer ${forgedToken}`,
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(AUTH_ERROR_CODES).toContain(response.status());
		});

		test('should reject JWT with tampered payload', async ({ page }) => {
			const tamperedToken = createTamperedJWT({
				sub: 'admin',
				iss: 'http://localhost:8080'
			});

			const response = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
				headers: {
					Authorization: `Bearer ${tamperedToken}`,
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(AUTH_ERROR_CODES).toContain(response.status());
		});

		test('should reject malformed token', async ({ page }) => {
			const response = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
				headers: {
					Authorization: 'Bearer not.a.valid.jwt',
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(AUTH_ERROR_CODES).toContain(response.status());
		});
	});
});
