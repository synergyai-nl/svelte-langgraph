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
		// Ratings on different messages are independent; making them wait on each
		// other would serialise the whole thread for no reason.
		const queue = createWriteQueue();
		const held = deferred();
		const settled: string[] = [];

		void queue('run-1', async () => {
			await held.promise;
			settled.push('slow');
		});
		await queue('run-2', async () => {
			settled.push('fast');
		});

		expect(settled).toEqual(['fast']);
		held.resolve();
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
