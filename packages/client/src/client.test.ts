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
		).rejects.toThrow('POST titles failed: 503');
	});
});

describe('feedback transport', () => {
	it('posts to /feedback with the same bearer the SDK sends', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await createClient('https://backend.test/api/', 'test-token').submitFeedback(
			'thread-1',
			'ai-1',
			'up'
		);

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://backend.test/api/feedback', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ thread_id: 'thread-1', message_id: 'ai-1', score: 'up' }),
			// Without one a stalled backend leaves the thumbs pending forever.
			signal: expect.any(AbortSignal)
		});
	});

	it('sends a comment with its rating', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await createClient('https://backend.test/api/', 'test-token').submitFeedback(
			'thread-1',
			'ai-1',
			'down',
			'too vague'
		);

		expect(fetchMock.mock.calls[0][1].body).toBe(
			JSON.stringify({
				thread_id: 'thread-1',
				message_id: 'ai-1',
				score: 'down',
				comment: 'too vague'
			})
		);
	});

	it('reports a rejected score to the caller', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

		await expect(
			createClient('https://backend.test/api/', 'test-token').submitFeedback(
				'thread-1',
				'ai-1',
				'up'
			)
		).rejects.toThrow(/404/);
	});
});

describe('createClient', () => {
	it('does not log a failure when no token is given', () => {
		const assertSpy = vi.spyOn(console, 'assert').mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			createClient('https://backend.test/api/');
			expect(assertSpy.mock.calls.filter(([condition]) => !condition)).toEqual([]);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			assertSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it('sends custom headers but no Authorization header without a token', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ title: 'Paris Trip' })));
		vi.stubGlobal('fetch', fetchMock);
		const client = createClient('https://backend.test/api/', undefined, { 'X-Org': 'acme' });
		await client.generateTitle(messages, new AbortController().signal);
		const init = fetchMock.mock.calls[0][1];
		expect(init.headers).toEqual({ 'X-Org': 'acme', 'Content-Type': 'application/json' });
	});
});

describe('function token', () => {
	const ok = () =>
		new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
	const authorization = (init: RequestInit) => new Headers(init.headers).get('Authorization');

	it('reads the token before every SDK request and route', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ok());
		vi.stubGlobal('fetch', fetchMock);
		let n = 0;
		const client = createClient('https://backend.test/api/', async () => `tok-${++n}`);

		await client.threads.search({ limit: 1 });
		await client.threads.search({ limit: 1 });
		await client.submitFeedback('thread-1', 'ai-1', 'up');

		expect(fetchMock.mock.calls.map(([, init]) => authorization(init))).toEqual([
			'Bearer tok-1',
			'Bearer tok-2',
			'Bearer tok-3'
		]);
	});

	it('keeps custom headers alongside the token', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ok());
		vi.stubGlobal('fetch', fetchMock);
		const client = createClient('https://backend.test/api/', () => 'tok', { 'X-Org': 'acme' });

		await client.threads.search({ limit: 1 });

		const headers = new Headers(fetchMock.mock.calls[0][1].headers);
		expect(headers.get('X-Org')).toBe('acme');
		expect(headers.get('Authorization')).toBe('Bearer tok');
	});

	it('sends no Authorization header when the function returns null', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ok());
		vi.stubGlobal('fetch', fetchMock);
		const client = createClient('https://backend.test/api/', async () => null);

		await client.threads.search({ limit: 1 });
		await client.submitFeedback('thread-1', 'ai-1', 'up');

		expect(fetchMock.mock.calls.map(([, init]) => authorization(init))).toEqual([null, null]);
	});

	it('fails the request when the token cannot be read', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const client = createClient('https://backend.test/api/', async () => {
			throw new Error('signed out');
		});

		await expect(client.submitFeedback('thread-1', 'ai-1', 'up')).rejects.toThrow('signed out');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends a string token on SDK requests as before', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ok());
		vi.stubGlobal('fetch', fetchMock);

		await createClient('https://backend.test/api/', 'test-token').threads.search({ limit: 1 });

		expect(authorization(fetchMock.mock.calls[0][1])).toBe('Bearer test-token');
	});
});
