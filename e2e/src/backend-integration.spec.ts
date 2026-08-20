import { authenticateUser } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';
import { expect, test } from './fixtures/test';

function toBase64Url(value: string): string {
	return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Helper to create forged JWT with alg:none attack
function createForgedJWT(payload: Record<string, unknown>): string {
	const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
	const body = toBase64Url(
		JSON.stringify({
			sub: 'attacker',
			iss: 'http://localhost:8080',
			exp: Math.floor(Date.now() / 1000) + 3600,
			...payload
		})
	);
	return `${header}.${body}.`; // Empty signature
}

// Helper to create tampered JWT with fake signature
function createTamperedJWT(payload: Record<string, unknown>): string {
	const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const body = toBase64Url(
		JSON.stringify({
			sub: 'admin', // Privilege escalation attempt
			iss: 'http://localhost:8080',
			exp: Math.floor(Date.now() / 1000) + 3600,
			...payload
		})
	);
	const fakeSig = toBase64Url('fake_signature');
	return `${header}.${body}.${fakeSig}`;
}

test.describe('Backend Integration', () => {
	test.describe('Health', () => {
		test('should be accessible', async ({ page }) => {
			const response = await page.request.get(`${LANGGRAPH_CONFIG.apiUrl}/health`);
			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body.status).toBe('healthy');
			expect(body.database).toBe('connected');
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

			// Set up response listener BEFORE navigation to avoid race condition
			const responsePromise = page.waitForResponse(
				(response) =>
					response.url().startsWith(LANGGRAPH_CONFIG.apiUrl) && response.status() === 200
			);
			await page.goto('/chat');
			await responsePromise;

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

			expect(response.status()).toBe(401);
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

			expect(response.status()).toBe(401);
		});

		test('should reject malformed token', async ({ page }) => {
			const response = await page.request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
				headers: {
					Authorization: 'Bearer not.a.valid.jwt',
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(response.status()).toBe(401);
		});
	});
});
