import { describe, it, expect, vi } from 'vitest';
import type { Client } from '@langchain/langgraph-sdk';
import { createThread, getOrCreateThread } from './client';
import { ThreadList } from './threadList.svelte';
import type { SearchedThread } from './threadList';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

function thread(
	threadId: string,
	updatedAt: string,
	metadata: Record<string, unknown>
): SearchedThread {
	return {
		thread_id: threadId,
		created_at: updatedAt,
		updated_at: updatedAt,
		status: 'idle',
		metadata
	};
}

function mockThreadStore(includeOrphan = true, includeChat = true) {
	const chat = thread('real-chat', '2026-09-01T12:00:00Z', { graph_id: 'chat' });
	const orphan = thread('orphan-title-run', '2026-09-01T12:01:00Z', {
		graph_id: 'title',
		thread_name: 'Help me plan a trip to Paris'
	});
	const fresh = thread('fresh-chat', '2026-09-01T12:02:00Z', { graph_id: 'chat' });
	const rows = [...(includeChat ? [chat] : []), ...(includeOrphan ? [orphan] : [])];
	// Apply the query before pagination, so server-side filtering is exercised too.
	const search = vi.fn(async (query: Parameters<Client['threads']['search']>[0] = {}) => {
		const matches = rows.filter(
			(row) =>
				(!query.status || row.status === query.status) &&
				(!query.ids || query.ids.includes(row.thread_id)) &&
				Object.entries(query.metadata ?? {}).every(([key, value]) => row.metadata?.[key] === value)
		);
		const sortBy = query.sortBy ?? 'updated_at';
		if (sortBy !== 'updated_at' && sortBy !== 'created_at') {
			throw new Error(`Unsupported fixture sort: ${sortBy}`);
		}
		matches.sort((a, b) => {
			const order = String(a[sortBy]).localeCompare(String(b[sortBy]));
			return query.sortOrder === 'asc' ? order : -order;
		});
		const offset = query.offset ?? 0;
		return matches.slice(offset, offset + (query.limit ?? 10));
	});
	const create = vi.fn().mockResolvedValue(fresh);
	const client = { threads: { search, create } } as unknown as Client;
	return { client, search, create, chat, fresh };
}

describe('title-thread leak', () => {
	it('/chat creates a tagged chat when only title orphans exist', async () => {
		const { client, fresh, create } = mockThreadStore(true, false);
		expect(await getOrCreateThread(client)).toEqual(fresh);
		expect(create).toHaveBeenCalledExactlyOnceWith({ metadata: { graph_id: 'chat' } });
	});

	it('an active title orphan cannot be pinned into the sidebar', async () => {
		const { client, search, chat } = mockThreadStore();
		const list = new ThreadList();
		try {
			list.setClient(client);
			list.setActiveThreadId('orphan-title-run');
			await vi.waitFor(() => expect(list.loading).toBe(false));
			expect(list.threads.map((row) => row.id)).toEqual([chat.thread_id]);
			const pinQueries = search.mock.calls.map(([query]) => query).filter((query) => query?.ids);
			expect(pinQueries.length).toBeGreaterThan(0);
			for (const query of pinQueries) expect(query?.metadata).toEqual({ graph_id: 'chat' });
		} finally {
			list.dispose();
		}
	});

	it('/chat reuses the real conversation instead of the newer idle title orphan', async () => {
		const { client, chat } = mockThreadStore();
		const selected = await getOrCreateThread(client);
		expect(selected.thread_id).toBe(chat.thread_id);
	});

	it('the sidebar excludes the title orphan and retains the real conversation', async () => {
		const { client, chat } = mockThreadStore();
		const list = new ThreadList();
		try {
			list.setClient(client);
			await vi.waitFor(() => expect(list.loading).toBe(false));
			expect(list.error).toBeNull();
			expect(list.threads.map((row) => row.id)).toEqual([chat.thread_id]);
		} finally {
			list.dispose();
		}
	});

	it('/chat still reuses the real conversation when there is no orphan', async () => {
		const { client, chat, create } = mockThreadStore(false);
		expect((await getOrCreateThread(client)).thread_id).toBe(chat.thread_id);
		expect(create).not.toHaveBeenCalled();
	});
});

it('the sidebar New chat action creates a fresh thread without searching for an idle one', async () => {
	const { client, fresh, search, create } = mockThreadStore();
	expect(await createThread(client)).toEqual(fresh);
	expect(create).toHaveBeenCalledExactlyOnceWith({ metadata: { graph_id: 'chat' } });
	expect(search).not.toHaveBeenCalled();
});
