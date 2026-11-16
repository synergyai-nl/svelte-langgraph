import { randomUUID } from 'node:crypto';
import { Client } from '@langchain/langgraph-sdk';
import type { APIRequestContext } from '@playwright/test';
import { authenticateUser, OIDC_CONFIG } from './fixtures/auth';
import { LANGGRAPH_CONFIG } from './fixtures/backend';
import { expect, test } from './fixtures/test';

const API_AUDIENCE = 'svelte-langgraph-api';

/** An access token minted by the OIDC mock: test-user's by default; a `null` claim is left out. */
async function mintToken(request: APIRequestContext, claims: Record<string, unknown> = {}) {
	const response = await request.post(`${OIDC_CONFIG.issuer}/__test__/token`, { data: claims });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { accessToken: string }).accessToken;
}

/** One user's calls to the backend, as raw HTTP so the status codes are visible. */
function apiAs(request: APIRequestContext, token: string) {
	return async (method: string, path: string, data?: unknown) => {
		const response = await request.fetch(`${LANGGRAPH_CONFIG.apiUrl}${path}`, {
			method,
			headers: { Authorization: `Bearer ${token}` },
			data
		});
		const text = await response.text();
		// Untyped on purpose: each test reads the fields its route returns.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let body: Record<string, any> = {};
		try {
			body = JSON.parse(text);
		} catch {
			// An event stream or an empty body.
		}
		return { status: response.status(), body, text };
	};
}
type Api = ReturnType<typeof apiAs>;

const humanInput = (content: string) => ({ messages: [{ type: 'human', content }] });

/** A user with a chat assistant and an empty thread of their own. */
async function setUpUser(request: APIRequestContext, sub?: string) {
	const api = apiAs(request, await mintToken(request, sub ? { sub } : {}));
	const assistant = await api('POST', '/assistants', { graph_id: 'chat', if_exists: 'do_nothing' });
	expect(assistant.status).toBe(200);
	const thread = await api('POST', '/threads', {});
	expect(thread.status).toBe(200);
	return {
		api,
		assistantId: assistant.body.assistant_id as string,
		threadId: thread.body.thread_id as string
	};
}

/** Start a background run; `slow` echoes a long input, which the AI mock streams for a while. */
async function startRun(api: Api, assistantId: string, threadId: string, slow = false) {
	const content = slow ? randomUUID().replace(/-/g, '').repeat(16) : 'Hello';
	const run = await api('POST', `/threads/${threadId}/runs`, {
		assistant_id: assistantId,
		input: humanInput(content)
	});
	expect(run.status, run.text).toBe(200);
	return run.body.run_id as string;
}

async function waitForRunStatus(api: Api, threadId: string, runId: string, status: string[]) {
	await expect
		.poll(
			async () =>
				status.includes((await api('GET', `/threads/${threadId}/runs/${runId}`)).body.status),
			{ timeout: 30_000, message: `run reaches ${status.join(' or ')}` }
		)
		.toBe(true);
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

		test('should reject a request without credentials', async ({ request }) => {
			const response = await request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
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
			test(`should reject ${name}`, async ({ request }) => {
				const response = await request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
					headers: { Authorization: `Bearer ${await mintToken(request, claims)}` },
					data: {}
				});
				expect(response.status()).toBe(401);
			});
		}

		for (const aud of [API_AUDIENCE, ['another-api', API_AUDIENCE]]) {
			test(`should accept the API audience as ${typeof aud === 'string' ? 'a string' : 'a list'}`, async ({
				request
			}) => {
				const response = await request.post(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
					headers: { Authorization: `Bearer ${await mintToken(request, { aud })}` },
					data: {}
				});
				expect(response.ok()).toBeTruthy();
			});
		}
	});

	test.describe('SDK', () => {
		test('should create assistants, stream and rejoin runs, and isolate threads by owner', async ({
			request
		}) => {
			const otherToken = await mintToken(request, { sub: OIDC_CONFIG.otherUsername });
			const client = (token: string) =>
				new Client({
					apiUrl: LANGGRAPH_CONFIG.apiUrl,
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
			const threadUrl = `${LANGGRAPH_CONFIG.apiUrl}/threads/${thread.thread_id}`;
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

	test.describe('Two-user isolation', () => {
		test.describe('Runs', () => {
			test('should hide a finished run from another user', async ({ request }) => {
				const a = await setUpUser(request);
				const b = await setUpUser(request, OIDC_CONFIG.otherUsername);
				const runId = await startRun(a.api, a.assistantId, a.threadId);
				await waitForRunStatus(a.api, a.threadId, runId, ['success']);

				const runPath = `/threads/${a.threadId}/runs/${runId}`;
				const reads = [
					['GET', runPath],
					['GET', `${runPath}/join`],
					['GET', `${runPath}/stream`]
				] as const;
				for (const [method, path] of reads) {
					const denied = await b.api(method, path);
					expect(denied.status, `${method} ${path} as B: ${denied.text}`).toBe(404);
					const allowed = await a.api(method, path);
					expect(allowed.status, `${method} ${path} as A: ${allowed.text}`).toBe(200);
				}
				// Listing is not an error for another user: it answers 200 with their own runs, none.
				const listPath = `/threads/${a.threadId}/runs`;
				expect(
					(await a.api('GET', listPath)).body.map((run: Record<string, unknown>) => run.run_id)
				).toEqual([runId]);
				const listed = await b.api('GET', listPath);
				expect(listed.status, listed.text).toBe(200);
				expect(listed.body).toEqual([]);
			});

			test('should not let another user cancel a running run', async ({ request }) => {
				test.setTimeout(60_000);
				const a = await setUpUser(request);
				const b = await setUpUser(request, OIDC_CONFIG.otherUsername);
				const runId = await startRun(a.api, a.assistantId, a.threadId, true);

				const cancelPath = `/threads/${a.threadId}/runs/${runId}/cancel`;
				const denied = await b.api('POST', cancelPath);
				expect(denied.status, denied.text).toBe(404);
				const bulk = await b.api('POST', '/runs/cancel', {
					thread_id: a.threadId,
					run_ids: [runId]
				});
				expect(bulk.status, bulk.text).toBe(404);
				expect((await a.api('GET', `/threads/${a.threadId}/runs/${runId}`)).body.status).not.toBe(
					'interrupted'
				);

				const cancelled = await a.api('POST', `${cancelPath}?wait=1`);
				expect(cancelled.status, cancelled.text).toBe(200);
				await waitForRunStatus(a.api, a.threadId, runId, ['interrupted', 'error', 'success']);
			});
		});

		test.describe('Store', () => {
			test('should scope items to the user who put them', async ({ request }) => {
				const a = await setUpUser(request);
				const b = await setUpUser(request, OIDC_CONFIG.otherUsername);
				const namespace = ['isolation', randomUUID()];
				const key = 'note';
				const value = { text: 'only for A' };

				const put = await a.api('PUT', '/store/items', { namespace, key, value });
				expect(put.status, put.text).toBe(204);

				const query = `key=${key}&namespace=${namespace.join('&namespace=')}`;
				const own = await a.api('GET', `/store/items?${query}`);
				expect(own.status, own.text).toBe(200);
				expect(own.body.value).toEqual(value);
				const foreign = await b.api('GET', `/store/items?${query}`);
				expect(foreign.status, foreign.text).toBe(404);

				// Search: the same namespace, as the other user, finds nothing. (A's own search is
				// not asserted: the owner filter from `add_owner` is applied to item values too.)
				const hidden = await b.api('POST', '/store/items/search', { namespace_prefix: namespace });
				expect(hidden.status, hidden.text).toBe(200);
				expect(hidden.body.items).toEqual([]);
			});
		});

		test.describe('Denied routes', () => {
			test('should refuse cron routes with 403', async ({ request }) => {
				const a = await setUpUser(request);
				const cron = { assistant_id: a.assistantId, schedule: '0 0 * * *' };
				for (const [method, path, data] of [
					['POST', '/runs/crons', cron],
					['POST', `/threads/${a.threadId}/runs/crons`, cron],
					['POST', '/runs/crons/search', {}]
				] as const) {
					const response = await a.api(method, path, data);
					expect(response.status, `${method} ${path}: ${response.text}`).toBe(403);
					expect(response.body.error).toBe('forbidden');
				}
			});

			test('should refuse state writes and commands with 403', async ({ request }) => {
				const a = await setUpUser(request);
				const write = await a.api('POST', `/threads/${a.threadId}/state`, {
					values: { phase: 'planning' }
				});
				expect(write.status, write.text).toBe(403);
				const command = await a.api('POST', `/threads/${a.threadId}/commands`, {
					method: 'run.input',
					params: { assistant_id: a.assistantId, input: humanInput('Hello') }
				});
				expect(command.status, command.text).toBe(403);
			});

			test('should keep the neighbouring thread routes open', async ({ request }) => {
				const a = await setUpUser(request);
				const state = await a.api('GET', `/threads/${a.threadId}/state`);
				expect(state.status, state.text).toBe(200);
				const patch = await a.api('PATCH', `/threads/${a.threadId}`, {
					metadata: { title: 'Renamed' }
				});
				expect(patch.status, patch.text).toBe(200);
				expect(patch.body.metadata.title).toBe('Renamed');
			});
		});

		test.describe('Run input', () => {
			const rejected: [string, Record<string, unknown>, string][] = [
				[
					'an identity key in configurable',
					{ config: { configurable: { user_id: 'someone-else' } } },
					'config.configurable.user_id'
				],
				[
					'an unknown configurable key',
					{ config: { configurable: { unknown_key: true } } },
					'config.configurable.unknown_key'
				],
				[
					'a configurable key of the wrong type',
					{ config: { configurable: { state_only_submit: 'yes' } } },
					'config.configurable.state_only_submit'
				],
				['a non-empty context', { context: { user_id: 'someone-else' } }, 'context']
			];
			for (const [name, extra, key] of rejected) {
				test(`should reject a run with ${name}`, async ({ request }) => {
					const a = await setUpUser(request);
					for (const route of ['runs/wait', 'runs/stream', 'runs']) {
						const response = await a.api('POST', `/threads/${a.threadId}/${route}`, {
							assistant_id: a.assistantId,
							input: humanInput('Hello'),
							...extra
						});
						expect(response.status, `${route}: ${response.text}`).toBe(422);
						expect(response.body.message).toContain(key);
					}
				});
			}

			test('should reject an assistant with an identity key in configurable', async ({
				request
			}) => {
				const a = await setUpUser(request);
				const response = await a.api('POST', '/assistants', {
					graph_id: 'chat',
					name: 'isolation',
					config: { configurable: { user_id: 'someone-else' } }
				});
				expect(response.status, response.text).toBe(422);
				expect(response.body.message).toContain('config.configurable.user_id');
			});

			test('should accept a run with only state_only_submit', async ({ request }) => {
				const a = await setUpUser(request);
				const response = await a.api('POST', `/threads/${a.threadId}/runs/wait`, {
					assistant_id: a.assistantId,
					input: humanInput('Hello'),
					config: { configurable: { state_only_submit: true } }
				});
				expect(response.status, response.text).toBe(200);
			});
		});
	});

	test.describe('CORS', () => {
		test('should allow the bearer and reconnect headers in a preflight', async ({
			request,
			baseURL
		}) => {
			const response = await request.fetch(`${LANGGRAPH_CONFIG.apiUrl}/threads/search`, {
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
