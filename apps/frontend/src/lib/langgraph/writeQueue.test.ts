import { describe, test, expect, vi } from 'vitest';
import { createWriteQueue } from './writeQueue';

/** A promise plus the handle to settle it, so a test can hold a write open. */
function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('createWriteQueue', () => {
	test('runs writes for one key in the order they were queued', async () => {
		const queue = createWriteQueue();
		const settled: string[] = [];
		const first = deferred();

		// Queued first but finishing last: unserialised, "b" would land first.
		const a = queue('run-1', async () => {
			await first.promise;
			settled.push('a');
		});
		const b = queue('run-1', async () => {
			settled.push('b');
		});

		first.resolve();
		await Promise.all([a, b]);

		expect(settled).toEqual(['a', 'b']);
	});

	test('does not hold one key behind another', async () => {
		// Only writes sharing a key contend. Callers key by whatever the target
		// actually serialises on — for thread metadata that is the thread, since
		// Aegra merges the whole blob rather than the one key being written.
		const queue = createWriteQueue();
		const held = deferred();
		const settled: string[] = [];

		void queue('thread-1', async () => {
			await held.promise;
			settled.push('slow');
		});
		await queue('thread-2', async () => {
			settled.push('fast');
		});

		expect(settled).toEqual(['fast']);
		held.resolve();
	});

	test('keeps a write queued mid-flight behind the one still running', async () => {
		// The slot is cleared only by the write still holding it. Clearing it
		// unconditionally would let the next caller start alongside a write that
		// has not finished — so the third write has to arrive *after* the first
		// settles, while the second is still going.
		const queue = createWriteQueue();
		const settled: string[] = [];
		const blockSecond = deferred();

		const a = queue('thread-1', async () => {
			settled.push('a');
		});
		const b = queue('thread-1', async () => {
			await blockSecond.promise;
			settled.push('b');
		});
		await a;

		const c = queue('thread-1', async () => {
			settled.push('c');
		});
		blockSecond.resolve();
		await Promise.all([b, c]);

		expect(settled).toEqual(['a', 'b', 'c']);
	});

	test('runs the next write even after one rejects', async () => {
		// A failed metadata write is logged and tolerated, so it must not poison
		// every rating change queued behind it.
		const queue = createWriteQueue();
		const settled: string[] = [];

		const failing = queue('run-1', () => Promise.reject(new Error('patch failed')));
		const after = queue('run-1', async () => {
			settled.push('after');
		});

		await expect(failing).resolves.toBeUndefined();
		await after;
		expect(settled).toEqual(['after']);
	});

	test('starts a later write immediately once the queue has drained', async () => {
		const queue = createWriteQueue();
		await queue('run-1', async () => {});

		const write = vi.fn().mockResolvedValue(undefined);
		await queue('run-1', write);

		expect(write).toHaveBeenCalledTimes(1);
	});
});
