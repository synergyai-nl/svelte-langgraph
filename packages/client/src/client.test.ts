import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';

afterEach(() => vi.unstubAllGlobals());

const messages = [{ type: 'human' as const, content: 'Plan a trip to Paris' }];

describe('direct title transport', () => {
	it('returns the authenticated request response without creating a run', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ title: 'Paris Trip' })));
		vi.stubGlobal('fetch', fetchMock);
		const client = createClient('https://backend.test/api/', 'test-token');
		const controller = new AbortController();
		expect(await client.generateTitle(messages, controller.signal)).toEqual({
			title: 'Paris Trip'
		});
		expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://backend.test/api/titles', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages }),
			signal: expect.any(AbortSignal)
		});
	});

	it('propagates caller cancellation to the HTTP request', async () => {
		let notifyStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			notifyStarted = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
							once: true
						});
						notifyStarted();
					})
			)
		);
		const controller = new AbortController();
		const request = createClient('https://backend.test/api/', 'test-token').generateTitle(
			messages,
			controller.signal
		);
		const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
		await started;
		controller.abort();
		await rejected;
	});

	it('rejects an unsuccessful response rather than treating it as a title', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
		await expect(
			createClient('https://backend.test/api/', 'test-token').generateTitle(
				messages,
				new AbortController().signal
			)
		).rejects.toThrow('Title request failed: 503');
	});
});
