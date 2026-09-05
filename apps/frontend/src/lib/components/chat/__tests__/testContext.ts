import { vi } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { LangGraphContext } from '../langGraphContext.svelte.js';
import type { DeepPartial, LangGraphLabels } from '../labels.js';

/**
 * A minimal client double: `assistants.getSchemas` resolves to a null schema so
 * `createStateSync` degrades gracefully (no state-sync UI) — matching the old `Chat` test
 * fixtures' `mockClient`. Spread `overrides` in to add `threads.get`/`threads.update`/etc. for
 * tests that need them (see title-mirroring tests).
 */
export function makeMockClient(overrides: Record<string, unknown> = {}): Client {
	return {
		assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) },
		...overrides
	} as unknown as Client;
}

/**
 * Builds a real `LangGraphContext`, pre-populated via its public setters — the same object a test
 * can then pass to `LangGraphHost` as `ctx`, and spy on (`vi.spyOn(ctx.threadList, 'refresh')`,
 * `vi.spyOn(ctx, 'setThreadLoading')`, ...) *before* the host mounts anything.
 */
export function makeContext(
	options: {
		client?: Client;
		assistantId?: string;
		labels?: DeepPartial<LangGraphLabels>;
	} = {}
): LangGraphContext {
	const ctx = new LangGraphContext();
	if (options.client) ctx.setClient(options.client);
	if (options.assistantId !== undefined) ctx.setAssistantId(options.assistantId);
	if (options.labels !== undefined) ctx.setLabels(options.labels);
	return ctx;
}
