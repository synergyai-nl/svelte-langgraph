import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStateSync, type StreamLike } from './stateSync.svelte.js';
import type { Client } from '@langchain/langgraph-sdk';

// Flush all pending microtasks and a macrotask so async IIFE resolves
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeMockStream(initialValues: Record<string, unknown> = {}): StreamLike & {
	values: Record<string, unknown>;
	submit: ReturnType<typeof vi.fn>;
} {
	const obj = {
		values: { ...initialValues },
		submit: vi.fn()
	};
	return obj;
}

type MockClient = Pick<Client, 'assistants'>;

function makeMockClient(resolvedSchema: unknown = null): MockClient {
	return {
		assistants: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			getSchemas: vi.fn().mockResolvedValue({ state_schema: resolvedSchema }) as any
		}
	} as unknown as MockClient;
}

const validSchema = {
	type: 'object',
	properties: {
		phase: { type: 'string', enum: ['research', 'draft', 'review'] }
	}
};

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('createStateSync', () => {
	describe('schema loading', () => {
		it('starts with loading status synchronously', () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient() as unknown as Client,
				assistantId: 'test'
			});
			expect(sync.schema.status).toBe('loading');
		});

		it('transitions to ok after getSchemas resolves with a valid schema', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			expect(sync.schema.status).toBe('loading');
			await flushPromises();
			expect(sync.schema.status).toBe('ok');
		});

		it('exposes parsed fields after loading', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.schema).toMatchObject({
				status: 'ok',
				fields: { phase: { kind: 'enum', options: ['research', 'draft', 'review'] } }
			});
		});
	});

	describe('unavailable cases', () => {
		it('becomes unavailable when getSchemas rejects', async () => {
			const client = {
				assistants: {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					getSchemas: vi.fn().mockRejectedValue(new Error('network error')) as any
				}
			} as unknown as Client;
			const stream = makeMockStream();
			const sync = createStateSync({ stream, client, assistantId: 'test' });
			await flushPromises();
			expect(sync.schema.status).toBe('unavailable');
		});

		it('becomes unavailable when state_schema is null', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(null) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.schema.status).toBe('unavailable');
		});

		it('becomes unavailable when state_schema is undefined', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(undefined) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.schema.status).toBe('unavailable');
		});
	});

	describe('field().value', () => {
		it('returns undefined when the field is absent from stream.values', async () => {
			const stream = makeMockStream({});
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.field('phase').value).toBeUndefined();
		});

		it('tracks stream.values reactively', async () => {
			const stream = makeMockStream({});
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			// Mutate the values object in place — field().value reads it fresh each time
			stream.values['phase'] = 'draft';
			expect(sync.field('phase').value).toBe('draft');
			stream.values['phase'] = 'review';
			expect(sync.field('phase').value).toBe('review');
		});

		it('returns undefined when schema is still loading', () => {
			const stream = makeMockStream({ phase: 'draft' });
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			// Before flushPromises — schema is still loading, but value reads stream directly
			expect(sync.field('phase').value).toBe('draft');
		});
	});

	describe('field().schema and field().options', () => {
		it('returns undefined schema while loading', () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			expect(sync.field('phase').schema).toBeUndefined();
		});

		it('returns field schema after loading', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.field('phase').schema).toEqual({
				kind: 'enum',
				options: ['research', 'draft', 'review']
			});
		});

		it('returns enum options after loading', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();
			expect(sync.field('phase').options).toEqual(['research', 'draft', 'review']);
		});

		it('returns empty options while loading', () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			expect(sync.field('phase').options).toEqual([]);
		});
	});

	describe('field().set()', () => {
		it('calls stream.submit with the state delta', async () => {
			const stream = makeMockStream({ phase: 'research' });
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			sync.field('phase').set('draft');

			expect(stream.submit).toHaveBeenCalledWith(
				{ phase: 'draft' },
				expect.objectContaining({ optimisticValues: expect.any(Function) })
			);
		});

		it('marks the submit as state-only via run config, not state', async () => {
			// The backend router (graph.py's _route_after_entry) uses this marker to
			// distinguish a pure field write from a chat turn, even when checkpoint
			// state still ends in a dangling HumanMessage (e.g. after a cancelled or
			// failed prior generation). It must travel via config, which is never
			// persisted to the checkpoint, rather than as a state key.
			const stream = makeMockStream({ phase: 'research' });
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			sync.field('phase').set('draft');

			expect(stream.submit).toHaveBeenCalledWith(
				{ phase: 'draft' },
				expect.objectContaining({
					config: { configurable: { state_only_submit: true } }
				})
			);
		});

		it('optimisticValues function spreads prev and overrides the field', async () => {
			const stream = makeMockStream({ phase: 'research' });
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			sync.field('phase').set('draft');

			const calls = (stream.submit as ReturnType<typeof vi.fn>).mock.calls;
			expect(calls).toHaveLength(1);
			const options = calls[0][1] as {
				optimisticValues: (prev: Record<string, unknown>) => Record<string, unknown>;
			};
			const result = options.optimisticValues({ phase: 'research', other: 'kept' });
			expect(result).toEqual({ phase: 'draft', other: 'kept' });
		});
	});

	describe('DEV warnings', () => {
		it('warns when set() targets a field absent from the loaded schema', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			sync.field('nonexistent').set('value');
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
		});

		it('warns when set() receives an enum value not in options', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			sync.field('phase').set('invalid_phase');
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid_phase'));
		});

		it('does not warn for a valid enum value', async () => {
			const stream = makeMockStream();
			const sync = createStateSync({
				stream,
				client: makeMockClient(validSchema) as unknown as Client,
				assistantId: 'test'
			});
			await flushPromises();

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			sync.field('phase').set('draft');
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});
});
