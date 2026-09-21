import { vi } from 'vitest';
import type { TitleClient } from '@svelte-langgraph/client';
import { LangGraphContext } from '../langGraphContext.svelte.js';
import type { DeepPartial, LangGraphLabels } from '../labels.js';

/**
 * A minimal client double: `assistants.getSchemas` resolves to a null schema so
 * `createStateSync` degrades gracefully (no state-sync UI) — matching the old `Chat` test
 * fixtures' `mockClient`. Spread `overrides` in to add `threads.get`/`threads.update`/etc. for
 * tests that need them (see title-mirroring tests).
 */
export function makeMockClient(overrides: Record<string, unknown> = {}): TitleClient {
	return {
		assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) },
		generateTitle: vi.fn().mockResolvedValue({ title: null }),
		...overrides
	} as unknown as TitleClient;
}

/**
 * Builds a real `LangGraphContext`, pre-populated via its public setters — the same object a test
 * can then pass to `LangGraphHost` as `ctx`, and spy on (`vi.spyOn(ctx.threadList, 'refresh')`,
 * `vi.spyOn(ctx, 'setThreadLoading')`, ...) *before* the host mounts anything.
 */
export function makeContext(
	options: {
		client?: TitleClient;
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
