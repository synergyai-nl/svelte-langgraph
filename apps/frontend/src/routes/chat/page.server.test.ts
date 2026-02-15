import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect, type Redirect } from '@sveltejs/kit';

// Mock the langgraph client module
vi.mock('$lib/langgraph/client', () => ({
	createClient: vi.fn(),
	getOrCreateThread: vi.fn()
}));

import { createClient, getOrCreateThread } from '$lib/langgraph/client';
import type { Client } from '@langchain/langgraph-sdk';

// Helper to build a minimal ServerLoadEvent-like object
function createEvent(session: { accessToken: string } | null) {
	return {
		locals: {
			auth: vi.fn().mockResolvedValue(session)
		}
	} as unknown as Parameters<typeof import('./+page.server').load>[0];
}

describe('chat/+page.server load', () => {
	const mockClient = {} as Client;

	beforeEach(() => {
		vi.mocked(createClient).mockReturnValue(mockClient);
	});

	it('should redirect authenticated users to an existing thread', async () => {
		const { load } = await import('./+page.server');

		vi.mocked(getOrCreateThread).mockResolvedValue({
			thread_id: 'thread-abc-123'
		} as Awaited<ReturnType<typeof getOrCreateThread>>);

		const event = createEvent({ accessToken: 'test-token' });

		try {
			await load(event);
			expect.unreachable('Expected a redirect to be thrown');
		} catch (e) {
			expect(isRedirect(e)).toBe(true);
			const r = e as Redirect;
			expect(r.status).toBe(302);
			expect(r.location).toBe('/chat/thread-abc-123');
		}

		expect(createClient).toHaveBeenCalledWith('test-token');
		expect(getOrCreateThread).toHaveBeenCalledWith(mockClient);
	});

	it('should return empty object for unauthenticated users (null session)', async () => {
		const { load } = await import('./+page.server');

		const event = createEvent(null);
		const result = await load(event);

		expect(result).toEqual({});
		expect(createClient).not.toHaveBeenCalled();
		expect(getOrCreateThread).not.toHaveBeenCalled();
	});

	it('should return empty object when session has no accessToken', async () => {
		const { load } = await import('./+page.server');

		const event = createEvent({ accessToken: '' } as unknown as { accessToken: string });
		const result = await load(event);

		expect(result).toEqual({});
		expect(createClient).not.toHaveBeenCalled();
	});

	it('should propagate errors from getOrCreateThread', async () => {
		const { load } = await import('./+page.server');

		vi.mocked(getOrCreateThread).mockRejectedValue(new Error('LangGraph unavailable'));

		const event = createEvent({ accessToken: 'test-token' });

		await expect(load(event)).rejects.toThrow('LangGraph unavailable');
	});
});
