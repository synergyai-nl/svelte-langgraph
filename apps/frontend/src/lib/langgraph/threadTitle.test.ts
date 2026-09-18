import { describe, it, expect, vi } from 'vitest';
import { createThreadTitler, selectOpeningExchange, type TitleClient } from './threadTitle';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('title request ownership', () => {
	it.each(['initial', 'pre-write'])(
		'stops after disposal during the %s metadata lookup',
		async (stage) => {
			const metadata = deferred<{ metadata: Record<string, unknown> }>();
			const started = deferred<void>();
			const get = vi.fn();
			if (stage === 'pre-write') get.mockResolvedValueOnce({ metadata: {} });
			get.mockImplementationOnce(() => {
				started.resolve();
				return metadata.promise;
			});
			const generateTitle = vi.fn().mockResolvedValue({ title: 'Paris Trip' });
			const update = vi.fn();
			const onTitled = vi.fn();
			const client = { threads: { get, update }, generateTitle } as unknown as TitleClient;
			const titler = createThreadTitler({ client, threadId: 'old-chat', onTitled });
			const exchange = [
				{ type: 'human', content: 'Paris' },
				{ type: 'ai', content: 'Museums' }
			];
			const request = titler.ensureThreadTitle(exchange);
			await started.promise;
			titler.dispose();
			metadata.resolve({ metadata: {} });
			await request;
			await titler.ensureThreadTitle(exchange);

			expect(get).toHaveBeenCalledTimes(stage === 'initial' ? 1 : 2);
			expect(generateTitle).toHaveBeenCalledTimes(stage === 'initial' ? 0 : 1);
			expect(update).not.toHaveBeenCalled();
			expect(onTitled).not.toHaveBeenCalled();
		}
	);

	it('does not notify after disposal while a metadata write completes', async () => {
		const written = deferred<void>();
		const started = deferred<void>();
		const update = vi.fn(() => {
			started.resolve();
			return written.promise;
		});
		const generateTitle = vi.fn().mockResolvedValue({ title: 'Paris Trip' });
		const onTitled = vi.fn();
		const client = {
			threads: { get: vi.fn().mockResolvedValue({ metadata: {} }), update },
			generateTitle
		} as unknown as TitleClient;
		const titler = createThreadTitler({ client, threadId: 'old-chat', onTitled });
		const exchange = [
			{ type: 'human', content: 'Paris' },
			{ type: 'ai', content: 'Museums' }
		];
		const request = titler.ensureThreadTitle(exchange);
		await started.promise;
		titler.dispose();
		written.resolve();
		await request;
		await titler.ensureThreadTitle(exchange);

		expect(update).toHaveBeenCalledExactlyOnceWith('old-chat', {
			metadata: { title: 'Paris Trip' }
		});
		expect(generateTitle).toHaveBeenCalledOnce();
		expect(onTitled).not.toHaveBeenCalled();
	});

	it('cancels an unmounted caller and ignores even a late successful response', async () => {
		const result = deferred<{ title: string }>();
		const started = deferred<void>();
		const generateTitle = vi.fn(() => {
			started.resolve();
			return result.promise;
		});
		const update = vi.fn();
		const onTitled = vi.fn();
		const client = {
			threads: { get: vi.fn().mockResolvedValue({ metadata: {} }), update },
			generateTitle
		} as unknown as TitleClient;
		const titler = createThreadTitler({ client, threadId: 'old-chat', onTitled });
		const exchange = [
			{ type: 'human', content: 'Paris' },
			{ type: 'ai', content: 'Museums' }
		];
		const request = titler.ensureThreadTitle(exchange);
		await started.promise;
		titler.dispose();
		const signal = vi.mocked(client.generateTitle).mock.calls[0][1];
		expect(signal.aborted).toBe(true);
		result.resolve({ title: 'Paris Trip' });
		await request;
		await titler.ensureThreadTitle(exchange);
		expect(generateTitle).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
		expect(onTitled).not.toHaveBeenCalled();
	});

	it('awaits each result and writes to its originating thread when requests finish in reverse order', async () => {
		const first = deferred<{ title: string }>();
		const second = deferred<{ title: string }>();
		const firstStarted = deferred<void>();
		const secondStarted = deferred<void>();
		const wait = vi
			.fn()
			.mockImplementationOnce(() => {
				firstStarted.resolve();
				return first.promise;
			})
			.mockImplementationOnce(() => {
				secondStarted.resolve();
				return second.promise;
			});
		const update = vi.fn().mockResolvedValue({});
		const client = {
			threads: { get: vi.fn().mockResolvedValue({ metadata: {} }), update },
			generateTitle: wait
		} as unknown as TitleClient;
		const firstExchange = [
			{ type: 'human', content: 'Plan a trip to Paris' },
			{ type: 'ai', content: 'Start with the museums.' }
		];
		const secondExchange = [
			{ type: 'human', content: 'Help with a Postgres query' },
			{ type: 'ai', content: 'Check the query plan.' }
		];
		const firstTitler = createThreadTitler({ client, threadId: 'paris' });
		const secondTitler = createThreadTitler({
			client,
			threadId: 'postgres'
		});
		const firstTask = firstTitler.ensureThreadTitle(firstExchange);
		await firstStarted.promise;
		const secondTask = secondTitler.ensureThreadTitle(secondExchange);
		await secondStarted.promise;

		expect(wait).toHaveBeenNthCalledWith(1, firstExchange, expect.any(AbortSignal));
		expect(wait).toHaveBeenNthCalledWith(2, secondExchange, expect.any(AbortSignal));
		expect(update).not.toHaveBeenCalled();

		second.resolve({ title: 'Postgres Query' });
		await secondTask;
		expect(update.mock.calls).toEqual([['postgres', { metadata: { title: 'Postgres Query' } }]]);

		first.resolve({ title: 'Paris Trip' });
		await firstTask;
		expect(update.mock.calls).toEqual([
			['postgres', { metadata: { title: 'Postgres Query' } }],
			['paris', { metadata: { title: 'Paris Trip' } }]
		]);
	});
});

describe('selectOpeningExchange', () => {
	it('returns the first human message and first non-empty AI message, in order', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		];

		expect(selectOpeningExchange(messages)).toEqual(messages);
	});

	it('returns fewer than 2 entries when the AI reply has not arrived yet', () => {
		const messages = [{ type: 'human', content: 'Hello', id: 'user-1' }];

		expect(selectOpeningExchange(messages)).toEqual(messages);
	});

	it('skips an empty-content AI message (e.g. a tool-call-only turn) for a later non-empty one', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: '', id: 'ai-1', tool_calls: [{ id: 'tc-1' }] },
			{ type: 'tool', content: 'tool result', id: 'tool-1' },
			{ type: 'ai', content: 'Here is the answer', id: 'ai-2' }
		];

		expect(selectOpeningExchange(messages)).toEqual([
			messages[0],
			{ type: 'ai', content: 'Here is the answer', id: 'ai-2' }
		]);
	});

	it('ignores later human/ai messages beyond the opening exchange', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' },
			{ type: 'human', content: 'A follow-up', id: 'user-2' },
			{ type: 'ai', content: 'Another reply', id: 'ai-2' }
		];

		expect(selectOpeningExchange(messages)).toEqual([messages[0], messages[1]]);
	});

	it('returns an empty array with no messages', () => {
		expect(selectOpeningExchange([])).toEqual([]);
	});
});
