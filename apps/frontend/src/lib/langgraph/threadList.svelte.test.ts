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
		it('falls back to a plain query when select is rejected, then skips select on later requests', async () => {
			const list = new ThreadList();
			const mock = makeMockClient();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			mock.threads.search.mockImplementation(async (query: Record<string, unknown>) => {
				if (query.select) throw new Error('select not supported');
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

	it('dispose aborts an in-flight request, so its late resolution is ignored', async () => {
		const list = new ThreadList();
		const mock = makeMockClient();
		const { promise, resolve } = deferred<unknown[]>();
		mock.threads.search.mockReturnValue(promise);

		list.setClient(asClient(mock));
		list.dispose();

		resolve([makeRawThread('thread-1')]);
		await flushPromises();

		expect(list.threads).toEqual([]);
		expect(list.error).toBeNull();
	});
});
