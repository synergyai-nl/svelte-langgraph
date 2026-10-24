import { Client } from '@langchain/langgraph-sdk';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { OIDC_CONFIG } from '../src/pages';

async function token(request: APIRequestContext, claims: Record<string, unknown> = {}) {
	const response = await request.post(`${OIDC_CONFIG.issuer}/__test__/token`, { data: claims });
	expect(response.ok()).toBe(true);
	return ((await response.json()) as { accessToken: string }).accessToken;
}

test('shared verifier rejects invalid credentials and accepts the configured API audience', async ({
	request
}) => {
	const invalid = [
		undefined,
		'not.a.jwt',
		await token(request, { exp: Math.floor(Date.now() / 1000) - 100 }),
		await token(request, { iss: 'https://wrong.example.test' }),
		await token(request, { aud: OIDC_CONFIG.clientId }),
		await token(request, { exp: null }),
		await token(request, { sub: '' })
	];
	for (const credential of invalid) {
		const response = await request.post('/threads/search', {
			headers: credential ? { Authorization: `Bearer ${credential}` } : {},
			data: {}
		});
		expect(response.status()).toBe(401);
	}
	for (const aud of ['svelte-langgraph-api', ['another-api', 'svelte-langgraph-api']]) {
		const response = await request.post('/threads/search', {
			headers: { Authorization: `Bearer ${await token(request, { aud })}` },
			data: {}
		});
		expect(response.ok()).toBe(true);
	}
});

test('the SDK can create assistants, stream chat, reconnect and enforce thread ownership', async ({
	request,
	baseURL
}) => {
	const ownerToken = await token(request);
	const otherToken = await token(request, { sub: 'other-user' });
	const owner = new Client({
		apiUrl: baseURL,
		defaultHeaders: { Authorization: `Bearer ${ownerToken}` }
	});
	const other = new Client({
		apiUrl: baseURL,
		defaultHeaders: { Authorization: `Bearer ${otherToken}` }
	});
	const assistant = await owner.assistants.create({ graphId: 'chat' });
	const otherAssistant = await other.assistants.create({ graphId: 'chat' });
	const thread = await owner.threads.create({ metadata: { owner: 'other-user' } });
	expect(thread.metadata?.owner).toBe('test-user');
	const chunks: string[] = [];
	let runId: string | undefined;
	for await (const chunk of owner.runs.stream(thread.thread_id, assistant.assistant_id, {
		input: { messages: [{ type: 'human', content: 'Hello' }] },
		streamMode: ['values', 'messages-tuple'],
		streamResumable: true
	})) {
		chunks.push(chunk.event);
		if (chunk.event === 'metadata') runId = (chunk.data as { run_id: string }).run_id;
	}
	expect(chunks).toContain('values');
	expect(chunks.some((event) => event.startsWith('messages'))).toBe(true);
	expect(runId).toBeTruthy();
	// Joining the completed resumable stream exercises a separately authenticated
	// connection, including the SDK's Last-Event-ID request header.
	for await (const chunk of owner.runs.joinStream(thread.thread_id, runId!, { lastEventId: '0' })) {
		expect(chunk.event).not.toBe('error');
	}
	const foreignSearch = await other.threads.search({ ids: [thread.thread_id] });
	expect(foreignSearch).toEqual([]);
	for (const [method, path, data] of [
		['GET', `/threads/${thread.thread_id}`, undefined],
		['PATCH', `/threads/${thread.thread_id}`, { metadata: { owner: 'other-user' } }],
		[
			'POST',
			`/threads/${thread.thread_id}/runs`,
			{
				// The caller owns this assistant: rejection must enforce the
				// foreign thread boundary, not assistant ownership.
				assistant_id: otherAssistant.assistant_id,
				input: { messages: [{ type: 'human', content: 'Unauthorized run' }] }
			}
		],
		['DELETE', `/threads/${thread.thread_id}`, undefined]
	] as const) {
		const response = await request.fetch(path, {
			method,
			headers: { Authorization: `Bearer ${otherToken}` },
			data
		});
		expect(
			[403, 404],
			`${method} ${path} returned ${response.status()}: ${await response.text()}`
		).toContain(response.status());
	}
	expect((await owner.threads.get(thread.thread_id)).thread_id).toBe(thread.thread_id);
	await owner.threads.delete(thread.thread_id);
});

test('browser preflight permits bearer and reconnect headers without cookies', async ({
	request
}) => {
	const response = await request.fetch('/threads/search', {
		method: 'OPTIONS',
		headers: {
			Origin: 'http://localhost:4173',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'authorization,content-type,last-event-id'
		}
	});
	expect(response.ok()).toBe(true);
	expect(['*', 'http://localhost:4173']).toContain(
		response.headers()['access-control-allow-origin']
	);
	const allowed = response.headers()['access-control-allow-headers'].toLowerCase();
	for (const name of ['authorization', 'content-type', 'last-event-id']) {
		expect(allowed === '*' || allowed.includes(name)).toBe(true);
	}
});
