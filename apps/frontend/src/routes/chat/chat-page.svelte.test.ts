import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Client, Thread } from '@langchain/langgraph-sdk';
import type { ThreadValues } from '$lib/langgraph/types';
import ChatIndexHost from './__tests__/ChatIndexHost.svelte';

const goto = vi.hoisted(() => vi.fn());
const getOrCreateThread = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$lib/langgraph/client', () => ({ getOrCreateThread }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

beforeEach(() => {
	goto.mockReset();
	getOrCreateThread.mockReset();
});

describe('/chat initialization', () => {
	test('does not redirect when its pending lookup resolves after teardown', async () => {
		const lookup = deferred<Thread<ThreadValues>>();
		getOrCreateThread.mockReturnValue(lookup.promise);
		const view = render(ChatIndexHost, { client: {} as Client });
		expect(getOrCreateThread).toHaveBeenCalledOnce();

		view.unmount();
		lookup.resolve({ thread_id: 'late-thread' } as Thread<ThreadValues>);
		await lookup.promise;
		await Promise.resolve();

		expect(goto).not.toHaveBeenCalled();
	});
});
