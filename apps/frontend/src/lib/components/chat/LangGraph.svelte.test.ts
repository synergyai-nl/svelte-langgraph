import { describe, test, expect } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Client } from '@langchain/langgraph-sdk';
import LangGraphProbe from './__tests__/LangGraphProbe.svelte';
import type { LangGraphContext } from './langGraphContext.svelte.js';

/**
 * `assistantId` is always given explicitly below so `<LangGraph>` skips real assistant
 * resolution (`getOrCreateAssistant`) — these tests are about client *identity*, not assistant
 * resolution, and a skipped resolution means no network calls happen against the fake `url`.
 */

function renderProbe(props: Record<string, unknown> = {}) {
	let ctx: LangGraphContext | undefined;
	const result = render(LangGraphProbe, {
		props: {
			assistantId: 'assistant-1',
			onCtx: (c: LangGraphContext | undefined) => (ctx = c),
			...props
		}
	});
	return { ...result, getCtx: () => ctx };
}

describe('<LangGraph> client identity', () => {
	test('same token string across prop updates keeps the same client object', async () => {
		const { rerender, getCtx } = renderProbe({ url: 'http://localhost:8000', token: 'tok-a' });
		await tick();
		const first = getCtx()?.client;
		expect(first).toBeDefined();

		await rerender({ url: 'http://localhost:8000', token: 'tok-a', assistantId: 'assistant-1' });
		await tick();

		expect(getCtx()?.client).toBe(first);
	});

	test('a changed token mints a new client', async () => {
		const { rerender, getCtx } = renderProbe({ url: 'http://localhost:8000', token: 'tok-a' });
		await tick();
		const first = getCtx()?.client;

		await rerender({ url: 'http://localhost:8000', token: 'tok-b', assistantId: 'assistant-1' });
		await tick();

		expect(getCtx()?.client).toBeDefined();
		expect(getCtx()?.client).not.toBe(first);
	});

	test('no token and no client prop leaves the client undefined', async () => {
		const { getCtx } = renderProbe({ url: 'http://localhost:8000' });
		await tick();

		expect(getCtx()?.client).toBeUndefined();
	});

	test('an explicit client prop always wins over url/token', async () => {
		const explicitClient = { assistants: {}, threads: {} } as unknown as Client;
		const { getCtx } = renderProbe({
			url: 'http://localhost:8000',
			token: 'tok-a',
			client: explicitClient
		});
		await tick();

		// Not `toBe`: Svelte wraps an object prop in a reactive proxy on its way through `$props()`,
		// so `ctx.client` is structurally, not referentially, the object passed in.
		expect(getCtx()?.client).toEqual(explicitClient);
	});

	test('explicit client prop wins even when the token subsequently changes', async () => {
		const explicitClient = { assistants: {}, threads: {} } as unknown as Client;
		const { rerender, getCtx } = renderProbe({
			url: 'http://localhost:8000',
			token: 'tok-a',
			client: explicitClient
		});
		await tick();

		await rerender({
			url: 'http://localhost:8000',
			token: 'tok-b',
			client: explicitClient,
			assistantId: 'assistant-1'
		});
		await tick();

		expect(getCtx()?.client).toEqual(explicitClient);
	});
});

describe('<LangGraph> assistantId prop', () => {
	test('an explicit assistantId prop always wins, skipping resolution', async () => {
		const { getCtx } = renderProbe({ assistantId: 'explicit-assistant' });
		await waitFor(() => expect(getCtx()?.assistantId).toBe('explicit-assistant'));
		expect(getCtx()?.error).toBeUndefined();
	});
});
