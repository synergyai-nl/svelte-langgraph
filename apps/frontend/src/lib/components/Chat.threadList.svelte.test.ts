import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ChatWithThreadListHost from './__tests__/ChatWithThreadListHost.svelte';
import type { Client } from '@langchain/langgraph-sdk';
import * as mockModule from './__tests__/mockUseStream.svelte';

// Mock useStream — this is the key dependency
vi.mock('@langchain/svelte', async () => {
	const mod = await import('./__tests__/mockUseStream.svelte');
	return { useStream: vi.fn(() => mod.mockStream) };
});

// Backing mocks for `client.threads.get`/`.update` — the SLG-117 title-mirroring effects under
// test below. Kept as standalone consts (rather than reached through `mockClient.threads.*`)
// so `.mockResolvedValueOnce(...)` etc. aren't type-checked against the real `Thread` return
// type, which `as unknown as Client` below deliberately opts out of for the whole mock object.
const threadsGetMock = vi.fn().mockResolvedValue({ metadata: {} });
const threadsUpdateMock = vi.fn().mockResolvedValue({});

// Provide assistants.getSchemas so createStateSync degrades gracefully (returns null schema).
const mockClient = {
	assistants: { getSchemas: vi.fn().mockResolvedValue({ state_schema: null }) },
	threads: {
		get: threadsGetMock,
		update: threadsUpdateMock
	}
} as unknown as Client;

function renderChatWithRefresh() {
	const refresh = vi.fn();
	render(ChatWithThreadListHost, {
		props: {
			refresh,
			chatProps: {
				langGraphClient: mockClient,
				assistantId: 'assistant-1',
				threadId: 'test-123'
			}
		}
	});
	return refresh;
}

beforeEach(() => {
	mockModule.resetMock();
	threadsGetMock.mockReset().mockResolvedValue({ metadata: {} });
	threadsUpdateMock.mockReset().mockResolvedValue({});
});

describe('Chat thread-list refresh notification', () => {
	test('does not refresh on an empty settled mount', async () => {
		const refresh = renderChatWithRefresh();

		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('does not refresh while a run is still streaming', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();

		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('refreshes exactly once when a run settles with messages', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('does not refresh again when nothing changed', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();
		expect(refresh).toHaveBeenCalledTimes(1);

		// Same thread, same message count — a re-render must not re-notify.
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('does not refresh when history hydrates after mount without a run ever loading', async () => {
		// isLoading stays false throughout — this simulates an existing thread's history fetch
		// resolving asynchronously after mount, not a run settling.
		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		await tick();

		expect(refresh).not.toHaveBeenCalled();
	});

	test('refreshes on a same-length message replacement (regenerate)', async () => {
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();
		expect(refresh).not.toHaveBeenCalled();

		// Regenerate replaces the AI message in place — same length, different content.
		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'A different answer!', id: 'ai-2' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('refreshes on every settle within the same mount, not just the first', async () => {
		mockModule.setMessages([{ type: 'human', content: 'Hello', id: 'user-1' }]);
		mockModule.setIsLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		]);
		mockModule.setIsLoading(false);
		await tick();
		expect(refresh).toHaveBeenCalledTimes(1);

		// A second run starts and settles in the same mount — must refresh again.
		mockModule.setIsLoading(true);
		await tick();

		mockModule.setMessages([
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' },
			{ type: 'human', content: 'Another message', id: 'user-2' },
			{ type: 'ai', content: 'Another reply', id: 'ai-2' }
		]);
		mockModule.setIsLoading(false);
		await tick();

		expect(refresh).toHaveBeenCalledTimes(2);
	});
});

describe('Chat thread-title mirroring (SLG-117)', () => {
	test('mirrors a new title on settle, and refreshes only after the PATCH resolves', async () => {
		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Trip to Kyoto' });
		mockModule.setIsLoading(false);
		await tick();

		// `waitFor`, not a bare assertion: every write now resolves title authority first, so an
		// awaited `threads.get` precedes the PATCH.
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
		expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
			metadata: { title: 'Trip to Kyoto' }
		});
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('serializes concurrent writes so a slow earlier PATCH cannot overwrite a newer title', async () => {
		// Reachable via regenerate: it branches from the pre-answer checkpoint, so the graph
		// generates a *different* title for the same mount. Aegra's metadata write is
		// last-write-wins, so two PATCHes in flight at once could persist the stale one if the
		// first completes second.
		let resolveFirst!: () => void;
		const firstInFlight = new Promise<void>((resolve) => (resolveFirst = resolve));
		threadsUpdateMock
			.mockImplementationOnce(async () => {
				await firstInFlight;
				return {};
			})
			.mockImplementationOnce(async () => ({}));

		renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Title A' });
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));

		// Second run settles while the first PATCH is still open.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Title B' });
		mockModule.setIsLoading(false);
		await tick();

		// The load-bearing assertion: B must not be sent while A is unresolved.
		expect(threadsUpdateMock).toHaveBeenCalledTimes(1);

		resolveFirst();
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(2));

		// ...and they land in request order, so the newest title is what persists.
		expect(threadsUpdateMock.mock.calls[0][1]).toEqual({ metadata: { title: 'Title A' } });
		expect(threadsUpdateMock.mock.calls[1][1]).toEqual({ metadata: { title: 'Title B' } });
	});

	test('drops a stale mount backfill when a newer title was mirrored while its GET was in flight', async () => {
		// The mount backfill captures `values.title` *before* awaiting `threads.get`. If a run
		// settles during that GET — regenerate branches from the pre-answer checkpoint and yields
		// a different title — the GET returns a snapshot predating that write, so writing the
		// captured title would overwrite the newer one. The backfill re-reads and drops itself.
		//
		// Note the settle's own write is queued *behind* the mount decision, so it lands only
		// once the GET resolves. That ordering is deliberate: it is what stops a settle racing an
		// unresolved GET and clobbering a rename.
		let resolveGet!: (value: { metadata: Record<string, unknown> }) => void;
		threadsGetMock.mockImplementationOnce(() => new Promise((resolve) => (resolveGet = resolve)));

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		// History resolves carrying title A, with metadata still untitled -> backfill starts.
		mockModule.setValues({ title: 'Title A' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// A regenerate settles while the GET is still open, wanting to mirror title B. Nothing is
		// written yet — it is queued behind the mount decision.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Title B' });
		mockModule.setIsLoading(false);
		await tick();
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// Now the stale GET returns, reporting metadata that predates B.
		resolveGet({ metadata: {} });

		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
		await tick();
		await tick();

		// The backfill must be dropped — B is the only thing ever written.
		expect(threadsUpdateMock).toHaveBeenCalledTimes(1);
		expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
			metadata: { title: 'Title B' }
		});
		expect(threadsUpdateMock).not.toHaveBeenCalledWith('test-123', {
			metadata: { title: 'Title A' }
		});
	});

	test('on mount, leaves an existing metadata title alone even when it differs from state', async () => {
		// The backfill fills an *absence*. A thread that already carries a title is done — the
		// stored value may be a deliberate rename from another client or tab (`threads.update` is
		// public SDK surface), and overwriting it would undo that on every reopen.
		threadsGetMock.mockResolvedValueOnce({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a follow-up message does not re-PATCH the generated title over a rename', async () => {
		// Recording the stored title in `mirroredTitle` is not enough on its own: the next settle
		// would see `values.title !== mirroredTitle` and write the generated title straight back,
		// so reopening a renamed thread and sending any message would undo the rename.
		threadsGetMock.mockResolvedValueOnce({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// A follow-up message settles; the graph still carries the same generated title.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a settle while the mount GET is still open cannot clobber a rename', async () => {
		// The race the "follow-up message" test above does NOT cover: that one waits for the GET
		// to resolve before settling, so `suppressedGraphTitle` is already set. Here the settle
		// happens while the GET is still in flight, when nothing yet knows a stored title exists.
		// Only queueing the settle behind the mount decision prevents the clobber.
		let resolveGet!: (value: { metadata: Record<string, unknown> }) => void;
		threadsGetMock.mockImplementationOnce(() => new Promise((resolve) => (resolveGet = resolve)));

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));

		// Follow-up settles with the GET still open.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// The GET finally reports an explicit rename.
		resolveGet({ metadata: { title: 'Renamed by the user' } });
		await tick();
		await tick();
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a genuinely regenerated title still overrides a stored one', async () => {
		// The suppression is keyed on the specific title we declined to mirror, not a flag —
		// otherwise finding a stored title once would disable titling for the rest of the mount.
		threadsGetMock.mockResolvedValueOnce({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// Regenerate branches from the pre-answer checkpoint and yields a *different* title.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Freshly regenerated title' });
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
		expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
			metadata: { title: 'Freshly regenerated title' }
		});
	});

	test('an external title set before the graph has one is never overwritten', async () => {
		// The thread is renamed elsewhere while its graph state has no title yet. A mount-time
		// authority check completes permanently here without ever calling `threads.get` (there is
		// nothing to compare against), so the first generated title later PATCHed over the rename.
		threadsGetMock.mockResolvedValue({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		// Hydration completes with no graph title at all.
		mockModule.setIsThreadLoading(false);
		await tick();
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// The first exchange now generates one.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalled());
		await tick();
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a failed authority lookup blocks the write, and is retried on the next settle', async () => {
		// A transient `threads.get` failure must not be treated as "no stored title" — that would
		// let the generated title overwrite a rename. It must also not block forever.
		threadsGetMock
			.mockRejectedValueOnce(new Error('network blip'))
			.mockResolvedValue({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsThreadLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await tick();
		await tick();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// A later settle retries the lookup, learns of the rename, and still declines to write.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(2));
		await tick();
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a settle before hydration completes cannot clobber a rename', async () => {
		// This ordering is reachable: `ChatInput` renders outside the `isThreadLoading` branch and
		// disables only on `isStreaming`, and `submitInput` guards on `stream.isLoading` alone —
		// so a run can settle before the mount backfill has run at all.
		threadsGetMock.mockResolvedValue({ metadata: { title: 'Renamed by the user' } });

		mockModule.setIsThreadLoading(true);
		renderChatWithRefresh();
		await tick();

		// Settle while history is still loading.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Generated title' });
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalled());
		await tick();
		await tick();

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('retries the mirror on the next settle when the PATCH failed', async () => {
		// The title is recorded as mirrored only once the PATCH resolves. Recording it up front
		// would make a transient failure a silent one-shot: on a fresh thread the mount-time
		// check has already run before the title existed, so it cannot backfill, and every later
		// settle would skip the PATCH as "already mirrored" — leaving the row untitled for the
		// rest of the mount.
		threadsUpdateMock.mockRejectedValueOnce(new Error('network blip'));

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Trip to Kyoto' });
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));

		// A second run settles with the same title still in state — the failed write must be
		// retried rather than skipped.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();

		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(2));
		expect(threadsUpdateMock).toHaveBeenLastCalledWith('test-123', {
			metadata: { title: 'Trip to Kyoto' }
		});
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	});

	test('does not re-issue an identical PATCH on a later settle with the same title', async () => {
		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Trip to Kyoto' });
		mockModule.setIsLoading(false);
		await tick();
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
		expect(threadsUpdateMock).toHaveBeenCalledTimes(1);

		// A second run settles with the exact same title (the graph didn't change it) — no new
		// PATCH, but the sidebar still gets nudged by the ordinary settle→refresh behaviour.
		mockModule.setIsLoading(true);
		await tick();
		mockModule.setIsLoading(false);
		await tick();

		expect(threadsUpdateMock).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	});

	test('on mount, no-ops when the thread already has the matching title', async () => {
		// Simulates reopening a thread that was already titled on a previous mount: `values.title`
		// arrives (from history hydration) already matching what's stored.
		mockModule.setValues({ title: 'Already titled' });
		threadsGetMock.mockResolvedValueOnce({ metadata: { title: 'Already titled' } });

		renderChatWithRefresh();
		await tick();
		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));

		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('on mount, mirrors the title when the stored metadata does not have it yet', async () => {
		// Simulates a tab closed mid-run: the graph had already written `values.title` before the
		// close, but the settle-time PATCH never got to run.
		mockModule.setValues({ title: 'Rescued title' });
		threadsGetMock.mockResolvedValueOnce({ metadata: {} });

		const refresh = renderChatWithRefresh();
		await tick();

		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Rescued title' }
			})
		);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('reproduces the real mount ordering: isThreadLoading starts true, then history resolves carrying the title', async () => {
		// In production, `useStream` sets `isThreadLoading = true` synchronously during component
		// init (history hydration kicks off before the first effect flush), and `values` is still
		// empty at that point — the title only arrives once history resolves. Setting both *before*
		// render reproduces that ordering, rather than relying on the mock's default `false`, which
		// would let the mount-check effect run (and pass) for the wrong reason.
		mockModule.setIsThreadLoading(true);

		const refresh = renderChatWithRefresh();
		await tick();

		// Still hydrating — nothing to check yet.
		expect(threadsGetMock).not.toHaveBeenCalled();
		expect(threadsUpdateMock).not.toHaveBeenCalled();

		// History resolves, carrying the title the graph had already written.
		mockModule.setValues({ title: 'Some title' });
		threadsGetMock.mockResolvedValueOnce({ metadata: {} });
		mockModule.setIsThreadLoading(false);
		await tick();

		await waitFor(() => expect(threadsGetMock).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(threadsUpdateMock).toHaveBeenCalledWith('test-123', {
				metadata: { title: 'Some title' }
			})
		);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('on mount, a fresh thread with no title never calls threads.get or threads.update', async () => {
		// Same true→false hydration ordering as above, but history resolves with no title at all
		// (a brand-new thread the graph hasn't titled yet) — the mount-check must stay a no-op.
		mockModule.setIsThreadLoading(true);

		renderChatWithRefresh();
		await tick();

		mockModule.setIsThreadLoading(false);
		await tick();

		expect(threadsGetMock).not.toHaveBeenCalled();
		expect(threadsUpdateMock).not.toHaveBeenCalled();
	});

	test('a rejected settle-time PATCH does not throw and does not block the refresh', async () => {
		threadsUpdateMock.mockRejectedValueOnce(new Error('network blip'));

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Might fail' });
		mockModule.setIsLoading(false);

		await expect(tick()).resolves.not.toThrow();
		expect(threadsUpdateMock).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	test('refresh fires strictly after the settle-time PATCH resolves, not before', async () => {
		let resolveUpdate!: () => void;
		threadsUpdateMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveUpdate = () => resolve(undefined);
				})
		);

		const refresh = renderChatWithRefresh();
		await tick();

		mockModule.setIsLoading(true);
		await tick();
		mockModule.setValues({ title: 'Deferred title' });
		mockModule.setIsLoading(false);
		await tick();

		// The PATCH has been issued but is still pending — refresh must not have fired yet.
		// `waitFor` for the issue itself, since the authority `threads.get` is awaited first.
		await waitFor(() => expect(threadsUpdateMock).toHaveBeenCalledTimes(1));
		expect(refresh).not.toHaveBeenCalled();

		resolveUpdate();
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});
});
