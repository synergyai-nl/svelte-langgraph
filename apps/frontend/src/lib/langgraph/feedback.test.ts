import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { COMMENT_MAX_LENGTH, submitFeedback } from './feedback';

// The backend URL is read from `$env/dynamic/public`, a SvelteKit global that
// only exists at runtime. Mutable so each test can set its own shape, and
// hoisted because vi.mock is lifted above ordinary declarations.
const { env } = vi.hoisted(() => ({ env: {} as { PUBLIC_LANGGRAPH_API_URL?: string } }));
vi.mock('$env/dynamic/public', () => ({ env }));

/** Typed with fetch's own shape so `mock.calls` keeps the argument types. */
type FetchCall = (url: string, init: RequestInit) => Promise<Response>;

const ok: FetchCall = () => Promise.resolve(new Response(null, { status: 200 }));

beforeEach(() => {
	env.PUBLIC_LANGGRAPH_API_URL = 'https://backend.test';
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** The URL the one fetch call was made against. */
function postedUrl(fetchMock: Mock<FetchCall>): string {
	expect(fetchMock).toHaveBeenCalledTimes(1);
	return fetchMock.mock.calls[0][0];
}

describe('submitFeedback', () => {
	test.each([
		['no trailing slash', 'https://backend.test'],
		// The SDK strips this one itself, so threads and runs keep working on a
		// value that would otherwise send ratings to "//feedback" -- a 404 that
		// looks like a backend fault rather than a configuration one.
		['a trailing slash', 'https://backend.test/']
	])('posts to the same URL given %s', async (_label, configured) => {
		env.PUBLIC_LANGGRAPH_API_URL = configured;
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		await submitFeedback('token', 'run-1', 'up');

		expect(postedUrl(fetchMock)).toBe('https://backend.test/feedback');
	});

	test('sends the rating with the caller as bearer', async () => {
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		await submitFeedback('token', 'run-1', 'down');

		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: 'POST',
			headers: expect.objectContaining({ Authorization: 'Bearer token' }),
			body: JSON.stringify({ run_id: 'run-1', score: 'down' })
		});
	});

	test('omits an empty comment rather than sending a blank one', async () => {
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		await submitFeedback('token', 'run-1', 'up', '   \n ');

		expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ run_id: 'run-1', score: 'up' }));
	});

	test('refuses a comment over the shared limit', async () => {
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			submitFeedback('token', 'run-1', 'up', 'x'.repeat(COMMENT_MAX_LENGTH + 1))
		).rejects.toThrow(/at most/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('counts the limit in code points, so emoji are not halved', async () => {
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		// Two UTF-16 units each: `.length` would reject this at twice the limit.
		await submitFeedback('token', 'run-1', 'up', '😀'.repeat(COMMENT_MAX_LENGTH));

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('reports a rejected score to the caller', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(null, { status: 404 })))
		);

		await expect(submitFeedback('token', 'run-1', 'up')).rejects.toThrow(/404/);
	});

	test('fails when the backend URL is unset', async () => {
		delete env.PUBLIC_LANGGRAPH_API_URL;
		const fetchMock = vi.fn<FetchCall>(ok);
		vi.stubGlobal('fetch', fetchMock);

		await expect(submitFeedback('token', 'run-1', 'up')).rejects.toThrow(
			/PUBLIC_LANGGRAPH_API_URL/
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
