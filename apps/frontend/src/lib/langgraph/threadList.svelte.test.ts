import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { ThreadList } from './threadList.svelte.js';
import { THREAD_SELECT } from './threadList.js';

// Flush all pending microtasks and a macrotask so async chains inside ThreadList resolve.
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeMockClient() {
	return { threads: { search: vi.fn() } };
}

type MockClient = ReturnType<typeof makeMockClient>;

function asClient(mock: MockClient): Client {
	return mock as unknown as Client;
}

function makeRawThread(id: string, overrides: Record<string, unknown> = {}) {
	return {
		thread_id: id,
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-02T00:00:00.000Z',
		status: 'idle',
		metadata: {},
		...overrides
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('ThreadList', () => {
	it('starts empty, not loading, no error, no hasMore', () => {
		const list = new ThreadList();
		expect(list.threads).toEqual([]);
		expect(list.loading).toBe(false);
		expect(list.error).toBeNull();
		expect(list.hasMore).toBe(false);
	});

	it('setClient triggers a load', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		const { promise, resolve } = deferred<unknown[]>();
		mock.threads.search.mockReturnValue(promise);

		list.setClient(asClient(mock));
		expect(list.loading).toBe(true);
		expect(mock.threads.search).toHaveBeenCalledTimes(1);

		resolve([makeRawThread('thread-1')]);
		await flushPromises();

		expect(list.loading).toBe(false);
		expect(list.threads).toHaveLength(1);
		expect(list.threads[0].id).toBe('thread-1');
	});

	it('calls search with the exact expected query, no metadata/status filter', async () => {
		const list = new ThreadList({ pageSize: 20 });
		const mock = makeMockClient();
		mock.threads.search.mockResolvedValue([]);

		list.setClient(asClient(mock));
		await flushPromises();

		expect(mock.threads.search).toHaveBeenCalledTimes(1);
		const arg = mock.threads.search.mock.calls[0][0];

		expect(arg).toMatchObject({
			limit: 20,
			offset: 0,
			sortBy: 'updated_at',
			sortOrder: 'desc',
			select: [...THREAD_SELECT]
		});
		expect(arg.signal).toBeInstanceOf(AbortSignal);
		expect(arg).not.toHaveProperty('metadata');
		expect(arg).not.toHaveProperty('status');
	});

	it('sets error and clears loading when search rejects', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		mock.threads.search.mockRejectedValue(new Error('boom'));

		list.setClient(asClient(mock));
		await flushPromises();

		expect(list.error).toBeInstanceOf(Error);
		expect(list.loading).toBe(false);
	});

	describe('select-rejection latch', () => {
		it('latches select off on a 422 rejection, then skips select on later requests', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.select) throw { status: 422 };
				return [makeRawThread('thread-1')];
			});

			list.setClient(asClient(mock));
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(2);
			expect(mock.threads.search.mock.calls[0][0]).toHaveProperty('select');
			expect(mock.threads.search.mock.calls[1][0]).not.toHaveProperty('select');
			expect(list.error).toBeNull();
			expect(list.threads).toHaveLength(1);
			expect(warnSpy).toHaveBeenCalledTimes(1);

			list.refresh();
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(3);
			expect(mock.threads.search.mock.calls[2][0]).not.toHaveProperty('select');
			expect(warnSpy).toHaveBeenCalledTimes(1);
		});

		it.each([400, 408, 429])(
			'does not latch on a %i rejection — select is probed again on the next request',
			async (status) => {
				const list = new ThreadList();
				const mock = makeMockClient();
				const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

				mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
					if (query.select) throw { status };
					return [makeRawThread('thread-1')];
				});

				list.setClient(asClient(mock));
				await flushPromises();

				expect(list.error).toBeNull();
				expect(list.threads).toHaveLength(1);
				expect(warnSpy).not.toHaveBeenCalled();

				list.refresh();
				await flushPromises();

				// Not latched: the refresh tries `select` first (second-to-last call), fails with
				// the same status again, and retries without it (last call).
				expect(mock.threads.search.mock.calls.at(-2)?.[0]).toHaveProperty('select');
				expect(mock.threads.search.mock.calls.at(-1)?.[0]).not.toHaveProperty('select');
			}
		);

		it('does not latch when the plain retry also fails — surfaces the error and tries select again next time', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			// Both the select-bearing request and the plain retry fail — a transient error (e.g.
			// a 5xx), not something specific to `select`.
			mock.threads.search.mockRejectedValue(new Error('server unavailable'));

			list.setClient(asClient(mock));
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(2);
			expect(mock.threads.search.mock.calls[0][0]).toHaveProperty('select');
			expect(mock.threads.search.mock.calls[1][0]).not.toHaveProperty('select');
			expect(list.error).toBeInstanceOf(Error);
			expect(list.loading).toBe(false);
			expect(warnSpy).not.toHaveBeenCalled();

			// Not latched: the next request tries `select` again.
			mock.threads.search.mockResolvedValue([makeRawThread('thread-1')]);
			list.refresh();
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(3);
			expect(mock.threads.search.mock.calls[2][0]).toHaveProperty('select');
			expect(list.error).toBeNull();
			expect(list.threads).toHaveLength(1);
		});

		it('does not latch on a 5xx even when the plain retry succeeds — a later refresh still sends select', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.select) throw { status: 500 };
				return [makeRawThread('thread-1')];
			});

			list.setClient(asClient(mock));
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(2);
			expect(mock.threads.search.mock.calls[0][0]).toHaveProperty('select');
			expect(mock.threads.search.mock.calls[1][0]).not.toHaveProperty('select');
			expect(list.error).toBeNull();
			expect(list.threads).toHaveLength(1);
			expect(warnSpy).not.toHaveBeenCalled();

			list.refresh();
			await flushPromises();

			// Not latched: the refresh tries `select` first, fails with 5xx again, and retries.
			expect(mock.threads.search).toHaveBeenCalledTimes(4);
			expect(mock.threads.search.mock.calls[2][0]).toHaveProperty('select');
			expect(mock.threads.search.mock.calls[3][0]).not.toHaveProperty('select');
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('does not latch on an unclassified rejection (plain Error)', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.select) throw new Error('unclassified failure');
				return [makeRawThread('thread-1')];
			});

			list.setClient(asClient(mock));
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(2);
			expect(list.error).toBeNull();
			expect(list.threads).toHaveLength(1);
			expect(warnSpy).not.toHaveBeenCalled();

			list.refresh();
			await flushPromises();

			// Not latched: the refresh still tries `select` first.
			expect(mock.threads.search).toHaveBeenCalledTimes(4);
			expect(mock.threads.search.mock.calls[2][0]).toHaveProperty('select');
		});
	});

	it('discards results from a superseded client after an abort, without surfacing an error', async () => {
		const list = new ThreadList();
		const mockA = makeMockClient();
		const mockB = makeMockClient();
		const { promise: promiseA, resolve: resolveA } = deferred<unknown[]>();
		mockA.threads.search.mockReturnValue(promiseA);
		mockB.threads.search.mockResolvedValue([makeRawThread('from-b')]);

		list.setClient(asClient(mockA));
		list.setClient(asClient(mockB));
		await flushPromises();

		expect(list.threads).toHaveLength(1);
		expect(list.threads[0].id).toBe('from-b');
		expect(list.error).toBeNull();

		// Late resolution of the superseded client's request must be discarded.
		resolveA([makeRawThread('from-a')]);
		await flushPromises();

		expect(list.threads).toHaveLength(1);
		expect(list.threads[0].id).toBe('from-b');
		expect(list.error).toBeNull();
	});

	it('setClient with the same client is a no-op', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		mock.threads.search.mockResolvedValue([]);
		const client = asClient(mock);

		list.setClient(client);
		await flushPromises();
		expect(mock.threads.search).toHaveBeenCalledTimes(1);

		list.setClient(client);
		await flushPromises();
		expect(mock.threads.search).toHaveBeenCalledTimes(1);
	});

	it('setClient(null) clears state without issuing a request', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		mock.threads.search.mockResolvedValue([makeRawThread('thread-1')]);

		list.setClient(asClient(mock));
		await flushPromises();
		expect(list.threads).toHaveLength(1);

		list.setClient(null);

		expect(list.threads).toEqual([]);
		expect(list.loading).toBe(false);
		expect(list.error).toBeNull();
		expect(list.hasMore).toBe(false);
		expect(mock.threads.search).toHaveBeenCalledTimes(1);
	});

	it('sets hasMore true on a full page and false on a short page', async () => {
		const fullPage = new ThreadList({ pageSize: 2 });
		const mockFull = makeMockClient();
		mockFull.threads.search.mockResolvedValue([makeRawThread('a'), makeRawThread('b')]);
		fullPage.setClient(asClient(mockFull));
		await flushPromises();
		expect(fullPage.hasMore).toBe(true);

		const shortPage = new ThreadList({ pageSize: 2 });
		const mockShort = makeMockClient();
		mockShort.threads.search.mockResolvedValue([makeRawThread('a')]);
		shortPage.setClient(asClient(mockShort));
		await flushPromises();
		expect(shortPage.hasMore).toBe(false);
	});

	describe('loadMore', () => {
		it('fetches the next page at the correct offset, appends, and de-dupes by id', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a'), makeRawThread('b')]);
			list.setClient(asClient(mock));
			await flushPromises();
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b']);

			// Second page includes a duplicate id ('b') plus one new thread ('c').
			mock.threads.search.mockResolvedValueOnce([makeRawThread('b'), makeRawThread('c')]);
			list.loadMore();
			await flushPromises();

			expect(mock.threads.search.mock.calls[1][0]).toMatchObject({ offset: 2 });
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b', 'c']);
		});

		it('is a no-op while a load is already in flight', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a'), makeRawThread('b')]);
			list.setClient(asClient(mock));
			await flushPromises();

			const { promise } = deferred<unknown[]>();
			mock.threads.search.mockReturnValueOnce(promise);
			list.loadMore();
			expect(mock.threads.search).toHaveBeenCalledTimes(2);

			list.loadMore();
			expect(mock.threads.search).toHaveBeenCalledTimes(2);
		});

		it('is a no-op when there is no more to fetch', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a')]);
			list.setClient(asClient(mock));
			await flushPromises();
			expect(list.hasMore).toBe(false);

			list.loadMore();
			await flushPromises();
			expect(mock.threads.search).toHaveBeenCalledTimes(1);
		});
	});

	it('refresh replaces the list rather than appending', async () => {
		const list = new ThreadList({ pageSize: 2 });
		const mock = makeMockClient();
		mock.threads.search.mockResolvedValueOnce([makeRawThread('a'), makeRawThread('b')]);
		list.setClient(asClient(mock));
		await flushPromises();
		expect(list.threads.map((t) => t.id)).toEqual(['a', 'b']);

		mock.threads.search.mockResolvedValueOnce([makeRawThread('c')]);
		list.refresh();
		await flushPromises();

		expect(list.threads.map((t) => t.id)).toEqual(['c']);
	});

	describe('retry', () => {
		it('replays a failed refresh, which loadMore cannot recover', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			// A single short page: hasMore stays false, which is exactly what made the old
			// loadMore()-based retry a silent no-op.
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a')]);
			list.setClient(asClient(mock));
			await flushPromises();
			expect(list.hasMore).toBe(false);

			mock.threads.search.mockRejectedValueOnce(new Error('boom'));
			list.refresh();
			await flushPromises();
			expect(list.error).not.toBeNull();
			expect(list.threads.map((t) => t.id)).toEqual(['a']);

			// loadMore() would bail on !hasMore and never issue a request.
			const callsBefore = mock.threads.search.mock.calls.length;
			list.loadMore();
			expect(mock.threads.search.mock.calls.length).toBe(callsBefore);

			mock.threads.search.mockResolvedValueOnce([makeRawThread('b')]);
			list.retry();
			await flushPromises();

			expect(list.error).toBeNull();
			// Replayed as the refresh it was: replace, not append.
			expect(list.threads.map((t) => t.id)).toEqual(['b']);
		});

		it('replays a failed loadMore at its own offset, appending rather than replacing', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a'), makeRawThread('b')]);
			list.setClient(asClient(mock));
			await flushPromises();
			expect(list.hasMore).toBe(true);

			mock.threads.search.mockRejectedValueOnce(new Error('boom'));
			list.loadMore();
			await flushPromises();
			expect(list.error).not.toBeNull();

			mock.threads.search.mockResolvedValueOnce([makeRawThread('c')]);
			list.retry();
			await flushPromises();

			expect(list.error).toBeNull();
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b', 'c']);
			const lastQuery = mock.threads.search.mock.calls.at(-1)?.[0];
			expect(lastQuery).toMatchObject({ offset: 2 });
		});

		it('falls back to a refresh when nothing has failed', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValueOnce([makeRawThread('a')]);
			list.setClient(asClient(mock));
			await flushPromises();

			mock.threads.search.mockResolvedValueOnce([makeRawThread('z')]);
			list.retry();
			await flushPromises();

			expect(list.threads.map((t) => t.id)).toEqual(['z']);
		});
	});

	it('dispose aborts an in-flight request, so its late resolution is ignored', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		const { promise, resolve } = deferred<unknown[]>();
		mock.threads.search.mockReturnValue(promise);

		list.setClient(asClient(mock));
		expect(list.loading).toBe(true);

		list.dispose();
		expect(list.loading).toBe(false);

		resolve([makeRawThread('thread-1')]);
		await flushPromises();

		expect(list.threads).toEqual([]);
		expect(list.error).toBeNull();
		expect(list.loading).toBe(false);
	});

	describe('pinning the active thread', () => {
		it('fetches the pin by ids when the active thread is absent from the loaded pages', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');
			await flushPromises();

			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a', 'b']);

			const pinCall = mock.threads.search.mock.calls.find(
				(call) => (call[0] as Record<string, unknown>).ids
			);
			expect(pinCall?.[0]).toMatchObject({ ids: ['target'], limit: 1 });
		});

		it('does not fetch a pin when the active thread is already in a loaded page', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			mock.threads.search.mockResolvedValue([makeRawThread('a'), makeRawThread('target')]);

			list.setClient(asClient(mock));
			await flushPromises();
			mock.threads.search.mockClear();

			list.setActiveThreadId('target');
			await flushPromises();

			expect(mock.threads.search).not.toHaveBeenCalled();
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'target']);
		});

		it('drops the pin once the real row surfaces via loadMore, without duplicating it', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				if (query.offset === 0) return [makeRawThread('a'), makeRawThread('b')];
				return [makeRawThread('target'), makeRawThread('c')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');
			await flushPromises();

			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a', 'b']);

			list.loadMore();
			await flushPromises();

			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b', 'target', 'c']);
			expect(list.threads.filter((t) => t.id === 'target')).toHaveLength(1);
		});

		it('drops the pin once refresh surfaces the real row, without duplicating it', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');
			await flushPromises();
			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a', 'b']);

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('target'), makeRawThread('a')];
			});

			list.refresh();
			await flushPromises();

			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a']);
			expect(list.threads.filter((t) => t.id === 'target')).toHaveLength(1);
		});

		it('refresh does not re-fetch an already-successful pin', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');
			await flushPromises();
			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a', 'b']);

			mock.threads.search.mockClear();
			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.refresh();
			await flushPromises();

			// Only the paged reload fired — the pin was already resolved for this active id.
			expect(
				mock.threads.search.mock.calls.some((call) => (call[0] as Record<string, unknown>).ids)
			).toBe(false);
			expect(list.threads.map((t) => t.id)).toEqual(['target', 'a', 'b']);
		});

		it('a failed pin fetch leaves error null and the list usable', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) throw new Error('pin lookup failed');
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');
			await flushPromises();

			expect(list.error).toBeNull();
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b']);
			expect(warnSpy).toHaveBeenCalled();
		});

		it('an empty pin result (foreign or deleted id) leaves the list usable with no pinned row', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			list.setActiveThreadId('not-mine');
			await flushPromises();

			expect(list.error).toBeNull();
			expect(list.threads.map((t) => t.id)).toEqual(['a', 'b']);
		});

		it('dispose aborts an in-flight pin fetch', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const { promise: pagePromise } = deferred<unknown[]>();
			const { promise: pinPromise } = deferred<unknown[]>();

			mock.threads.search.mockImplementation((query: Record<string, unknown>) =>
				query.ids ? pinPromise : pagePromise
			);

			list.setClient(asClient(mock));
			list.setActiveThreadId('target');

			const pinCall = mock.threads.search.mock.calls.find(
				(call) => (call[0] as Record<string, unknown>).ids
			);
			const pinSignal = (pinCall?.[0] as Record<string, unknown>).signal as AbortSignal;
			expect(pinSignal.aborted).toBe(false);

			list.dispose();

			expect(pinSignal.aborted).toBe(true);
		});

		it('the pin fetch honours the select latch', async () => {
			const list = new ThreadList({ pageSize: 2 });
			const mock = makeMockClient();
			vi.spyOn(console, 'warn').mockImplementation(() => {});

			// Latch `select` off via the paged load's select-bearing request getting a 422.
			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.select) throw { status: 422 };
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setClient(asClient(mock));
			await flushPromises();

			mock.threads.search.mockClear();
			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.ids) return [makeRawThread('target')];
				return [makeRawThread('a'), makeRawThread('b')];
			});

			list.setActiveThreadId('target');
			await flushPromises();

			expect(mock.threads.search).toHaveBeenCalledTimes(1);
			expect(mock.threads.search.mock.calls[0][0]).not.toHaveProperty('select');
			expect(mock.threads.search.mock.calls[0][0]).toMatchObject({ ids: ['target'] });
		});
	});

	describe('initialLoading', () => {
		it('reports loading true before any client arrives, cleared by setClient(null)', () => {
			const list = new ThreadList({ initialLoading: true });

			expect(list.loading).toBe(true);
			expect(list.threads).toEqual([]);
			expect(list.error).toBeNull();

			list.setClient(null);

			expect(list.loading).toBe(false);
		});

		it('defaults to not loading when the option is omitted', () => {
			const list = new ThreadList();
			expect(list.loading).toBe(false);
		});
	});
});
