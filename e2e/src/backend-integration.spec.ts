import { Client } from '@langchain/langgraph-sdk';
import type { APIRequestContext } from '@playwright/test';
import { authenticateUser, OIDC_CONFIG } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';
import { expect, test } from './fixtures/test';

const API_AUDIENCE = 'svelte-langgraph-api';
/**
 * API-level checks that need only the API and the OIDC mock. `moon e2e:test-runtime-contract`
 * runs them against Aegra and the LangGraph Server runtime through the `apiUrl` option.
 */
const RUNTIME_CONTRACT = { tag: '@runtime-contract' };

/** An access token minted by the OIDC mock: test-user's by default; a `null` claim is left out. */
async function mintToken(request: APIRequestContext, claims: Record<string, unknown> = {}) {
	const response = await request.post(`${OIDC_CONFIG.issuer}/__test__/token`, { data: claims });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { accessToken: string }).accessToken;
}

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

	test.describe('JWT Security', RUNTIME_CONTRACT, () => {
		// Drives the app, so the runtime contract suite, which starts no frontend, leaves it out.
		test('should accept valid token from OIDC provider', { tag: '@frontend' }, async ({ page }) => {
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
			const claims = JSON.parse(
				Buffer.from(String(capturedToken).split('.')[1], 'base64url').toString()
			);
			expect(claims.aud, 'the bearer is an access token for the API').toBe(API_AUDIENCE);

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

		test('should reject forged JWT with alg:none', async ({ request, apiUrl }) => {
			const forgedToken = createForgedJWT({ sub: 'attacker' });

			const response = await request.post(`${apiUrl}/threads/search`, {
				headers: {
					Authorization: `Bearer ${forgedToken}`,
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(response.status()).toBe(401);
		});

		test('should reject JWT with tampered payload', async ({ request, apiUrl }) => {
			const tamperedToken = createTamperedJWT({
				sub: 'admin',
				iss: 'http://localhost:8080'
			});

			const response = await request.post(`${apiUrl}/threads/search`, {
				headers: {
					Authorization: `Bearer ${tamperedToken}`,
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(response.status()).toBe(401);
		});

		test('should reject malformed token', async ({ request, apiUrl }) => {
			const response = await request.post(`${apiUrl}/threads/search`, {
				headers: {
					Authorization: 'Bearer not.a.valid.jwt',
					'Content-Type': 'application/json'
				},
				data: {}
			});

			expect(response.status()).toBe(401);
		});

		test('should reject a request without credentials', async ({ request, apiUrl }) => {
			const response = await request.post(`${apiUrl}/threads/search`, {
				data: {}
			});
			expect(response.status()).toBe(401);
		});

		const invalidClaims: [string, Record<string, unknown>][] = [
			['an expired token', { exp: Math.floor(Date.now() / 1000) - 100 }],
			['a token from another issuer', { iss: 'https://wrong.example.test' }],
			['an id token (client id audience)', { aud: OIDC_CONFIG.clientId }],
			['a token without exp', { exp: null }],
			['a token with an empty sub', { sub: '' }]
		];
		for (const [name, claims] of invalidClaims) {
			test(`should reject ${name}`, async ({ request, apiUrl }) => {
				const response = await request.post(`${apiUrl}/threads/search`, {
					headers: { Authorization: `Bearer ${await mintToken(request, claims)}` },
					data: {}
				});
				expect(response.status()).toBe(401);
			});
		}

		for (const aud of [API_AUDIENCE, ['another-api', API_AUDIENCE]]) {
			test(`should accept the API audience as ${typeof aud === 'string' ? 'a string' : 'a list'}`, async ({
				request,
				apiUrl
			}) => {
				const response = await request.post(`${apiUrl}/threads/search`, {
					headers: { Authorization: `Bearer ${await mintToken(request, { aud })}` },
					data: {}
				});
				expect(response.ok()).toBeTruthy();
			});
		}
	});

	test.describe('SDK', RUNTIME_CONTRACT, () => {
		test('should create assistants, stream and rejoin runs, and isolate threads by owner', async ({
			request,
			apiUrl
		}) => {
			const otherToken = await mintToken(request, { sub: OIDC_CONFIG.otherUsername });
			const client = (token: string) =>
				new Client({
					apiUrl,
					defaultHeaders: { Authorization: `Bearer ${token}` }
				});
			const owner = client(await mintToken(request));
			const other = client(otherToken);
			// Aegra keeps one assistant per user, graph and config; earlier specs may have made it.
			const chatAssistant = (user: Client) =>
				user.assistants.create({ graphId: 'chat', ifExists: 'do_nothing' });
			const assistant = await chatAssistant(owner);
			const otherAssistant = await chatAssistant(other);
			const thread = await owner.threads.create({ metadata: { owner: OIDC_CONFIG.otherUsername } });
			expect(thread.metadata?.owner, 'the backend sets the owner').toBe(OIDC_CONFIG.username);

			const events: string[] = [];
			let runId: string | undefined;
			for await (const chunk of owner.runs.stream(thread.thread_id, assistant.assistant_id, {
				input: { messages: [{ type: 'human', content: 'Hello' }] },
				streamMode: ['values', 'messages-tuple'],
				streamResumable: true
			})) {
				events.push(chunk.event);
				if (chunk.event === 'metadata') runId = (chunk.data as { run_id: string }).run_id;
			}
			expect(events).toContain('values');
			expect(events.some((event) => event.startsWith('messages'))).toBe(true);
			expect(runId).toBeTruthy();
			// Rejoining the finished resumable stream is a separately authenticated request that
			// carries the SDK's Last-Event-ID header.
			for await (const chunk of owner.runs.joinStream(thread.thread_id, runId!, {
				lastEventId: '0'
			})) {
				expect(chunk.event).not.toBe('error');
			}

			expect(await other.threads.search({ ids: [thread.thread_id] })).toEqual([]);
			const threadUrl = `${apiUrl}/threads/${thread.thread_id}`;
			for (const [method, url, data] of [
				['GET', threadUrl, undefined],
				['PATCH', threadUrl, { metadata: { owner: OIDC_CONFIG.otherUsername } }],
				[
					'POST',
					`${threadUrl}/runs`,
					{
						// other-user owns this assistant, so a rejection is the thread's boundary.
						assistant_id: otherAssistant.assistant_id,
						input: { messages: [{ type: 'human', content: 'Unauthorized run' }] }
					}
				],
				['DELETE', threadUrl, undefined]
			] as const) {
				const response = await request.fetch(url, {
					method,
					headers: { Authorization: `Bearer ${otherToken}` },
					data
				});
				expect(
					[403, 404],
					`${method} ${url} returned ${response.status()}: ${await response.text()}`
				).toContain(response.status());
			}
			expect((await owner.threads.get(thread.thread_id)).thread_id).toBe(thread.thread_id);
			await owner.threads.delete(thread.thread_id);
		});
	});

	test.describe('CORS', RUNTIME_CONTRACT, () => {
		test('should allow the bearer and reconnect headers in a preflight', async ({
			request,
			baseURL,
			apiUrl
		}) => {
			const response = await request.fetch(`${apiUrl}/threads/search`, {
				method: 'OPTIONS',
				headers: {
					Origin: baseURL!,
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'authorization,content-type,last-event-id'
				}
			});
			expect(response.ok()).toBeTruthy();
			expect(['*', baseURL]).toContain(response.headers()['access-control-allow-origin']);
			const allowed = response.headers()['access-control-allow-headers'].toLowerCase();
			for (const name of ['authorization', 'content-type', 'last-event-id']) {
				expect(allowed === '*' || allowed.includes(name), `${name} is allowed`).toBe(true);
			}
		});
	});
});
