import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { LangGraphContext } from './langGraphContext.svelte.js';
import { makeContext, makeMockClient } from './__tests__/testContext.js';
import UseLangGraphProbe from './__tests__/UseLangGraphProbe.svelte';

describe('LangGraphContext', () => {
	describe('activeThreadId — uncontrolled (no activeThreadId prop given)', () => {
		test('starts null', () => {
			const ctx = new LangGraphContext();
			expect(ctx.activeThreadId).toBeNull();
		});

		test('selectThread updates activeThreadId and fires onThreadChange', () => {
			const ctx = new LangGraphContext();
			const onThreadChange = vi.fn();
			ctx.setActiveThreadIdProp(undefined, onThreadChange);

			ctx.selectThread('thread-1');

			expect(ctx.activeThreadId).toBe('thread-1');
			expect(onThreadChange).toHaveBeenCalledExactlyOnceWith('thread-1');
		});

		test('selectThread(null) clears activeThreadId and still fires onThreadChange', () => {
			const ctx = new LangGraphContext();
			const onThreadChange = vi.fn();
			ctx.setActiveThreadIdProp(undefined, onThreadChange);
			ctx.selectThread('thread-1');

			ctx.selectThread(null);

			expect(ctx.activeThreadId).toBeNull();
			expect(onThreadChange).toHaveBeenLastCalledWith(null);
		});

		test('onThreadChange is optional — selectThread does not throw without one', () => {
			const ctx = new LangGraphContext();
			ctx.setActiveThreadIdProp(undefined, undefined);
			expect(() => ctx.selectThread('thread-1')).not.toThrow();
			expect(ctx.activeThreadId).toBe('thread-1');
		});
	});

	describe('activeThreadId — controlled (activeThreadId prop given)', () => {
		test('activeThreadId follows the prop value', () => {
			const ctx = new LangGraphContext();
			ctx.setActiveThreadIdProp('thread-A', undefined);
			expect(ctx.activeThreadId).toBe('thread-A');

			ctx.setActiveThreadIdProp('thread-B', undefined);
			expect(ctx.activeThreadId).toBe('thread-B');

			ctx.setActiveThreadIdProp(null, undefined);
			expect(ctx.activeThreadId).toBeNull();
		});

		test('selectThread fires onThreadChange but does not fork internal state', () => {
			const ctx = new LangGraphContext();
			const onThreadChange = vi.fn();
			ctx.setActiveThreadIdProp('thread-A', onThreadChange);

			ctx.selectThread('thread-B');

			// The caller (parent component) owns activeThreadId in controlled mode — selecting a
			// thread must not move it until the parent reacts to onThreadChange and pushes a new
			// prop value.
			expect(onThreadChange).toHaveBeenCalledExactlyOnceWith('thread-B');
			expect(ctx.activeThreadId).toBe('thread-A');

			ctx.setActiveThreadIdProp('thread-B', onThreadChange);
			expect(ctx.activeThreadId).toBe('thread-B');
		});
	});

	describe('setActiveThreadIdProp — stale createThreadError clearing', () => {
		test('clears createThreadError once the effective activeThreadId actually changes', async () => {
			const client = makeMockClient({
				threads: { create: vi.fn().mockRejectedValue(new Error('boom')) }
			});
			const ctx = makeContext({ client });
			ctx.setActiveThreadIdProp(undefined, undefined);

			await ctx.createThread();
			expect(ctx.createThreadError).not.toBeNull();

			ctx.setActiveThreadIdProp('some-other-thread', undefined);
			expect(ctx.createThreadError).toBeNull();
		});

		test('does not clear createThreadError when re-pushed with the same effective value', async () => {
			const client = makeMockClient({
				threads: { create: vi.fn().mockRejectedValue(new Error('boom')) }
			});
			const ctx = makeContext({ client });
			ctx.setActiveThreadIdProp(undefined, undefined);

			await ctx.createThread();
			expect(ctx.createThreadError).not.toBeNull();

			// LangGraph.svelte's wiring effect re-pushes this every render, not just on change.
			ctx.setActiveThreadIdProp(undefined, undefined);
			expect(ctx.createThreadError).not.toBeNull();
		});
	});

	describe('createThread', () => {
		test('success: creates, refreshes the thread list, selects the new thread, fires onThreadChange', async () => {
			const client = makeMockClient({
				threads: { create: vi.fn().mockResolvedValue({ thread_id: 'new-thread-1' }) }
			});
			const ctx = makeContext({ client });
			const onThreadChange = vi.fn();
			ctx.setActiveThreadIdProp(undefined, onThreadChange);
			const refreshSpy = vi.spyOn(ctx.threadList, 'refresh').mockImplementation(() => {});

			const result = await ctx.createThread();

			expect(result).toBe(true);
			expect(refreshSpy).toHaveBeenCalledTimes(1);
			expect(ctx.activeThreadId).toBe('new-thread-1');
			expect(onThreadChange).toHaveBeenCalledExactlyOnceWith('new-thread-1');
			expect(ctx.creatingThread).toBe(false);
			expect(ctx.createThreadError).toBeNull();
		});

		test('failure: sets createThreadError, does not select a thread, resolves false rather than throwing', async () => {
			const client = makeMockClient({
				threads: { create: vi.fn().mockRejectedValue(new Error('network blip')) }
			});
			const ctx = makeContext({ client });
			const onThreadChange = vi.fn();
			ctx.setActiveThreadIdProp(undefined, onThreadChange);
			const refreshSpy = vi.spyOn(ctx.threadList, 'refresh').mockImplementation(() => {});

			const result = await ctx.createThread();

			expect(result).toBe(false);
			expect(ctx.createThreadError).toBeInstanceOf(Error);
			expect(ctx.createThreadError?.message).toBe('network blip');
			expect(ctx.activeThreadId).toBeNull();
			expect(onThreadChange).not.toHaveBeenCalled();
			expect(refreshSpy).not.toHaveBeenCalled();
			expect(ctx.creatingThread).toBe(false);
		});

		test('resolves false, without throwing, when no client is set', async () => {
			const ctx = new LangGraphContext();
			await expect(ctx.createThread()).resolves.toBe(false);
		});

		test('sets creatingThread while in flight', async () => {
			let resolveCreate!: (thread: { thread_id: string }) => void;
			const client = makeMockClient({
				threads: {
					create: vi.fn(() => new Promise((resolve) => (resolveCreate = resolve)))
				}
			});
			const ctx = makeContext({ client });
			vi.spyOn(ctx.threadList, 'refresh').mockImplementation(() => {});

			expect(ctx.creatingThread).toBe(false);
			const pending = ctx.createThread();
			expect(ctx.creatingThread).toBe(true);

			resolveCreate({ thread_id: 'new-thread-1' });
			await pending;

			expect(ctx.creatingThread).toBe(false);
		});

		test('startedFrom race guard: a late failure after the active thread changed does not clobber state', async () => {
			let rejectCreate!: (err: Error) => void;
			const client = makeMockClient({
				threads: {
					create: vi.fn(() => new Promise((_resolve, reject) => (rejectCreate = reject)))
				}
			});
			const ctx = makeContext({ client });
			ctx.setActiveThreadIdProp(undefined, undefined);

			const pending = ctx.createThread();
			// The user navigates to a different thread (e.g. clicked a row in the sidebar) while the
			// creation is still in flight.
			ctx.selectThread('thread-navigated-to');

			rejectCreate(new Error('too slow'));
			const result = await pending;

			expect(result).toBe(false);
			// The failure must not stomp the thread the user is now looking at, nor surface a stale
			// error over it.
			expect(ctx.activeThreadId).toBe('thread-navigated-to');
			expect(ctx.createThreadError).toBeNull();
		});
	});

	describe('pendingThreadId / setThreadLoading', () => {
		test('starts null', () => {
			const ctx = new LangGraphContext();
			expect(ctx.pendingThreadId).toBeNull();
		});

		test('setThreadLoading(id, true) sets pendingThreadId to that id', () => {
			const ctx = new LangGraphContext();
			ctx.setThreadLoading('thread-1', true);
			expect(ctx.pendingThreadId).toBe('thread-1');
		});

		test('setThreadLoading(id, false) only clears pendingThreadId when the id matches', () => {
			const ctx = new LangGraphContext();
			ctx.setThreadLoading('thread-1', true);

			ctx.setThreadLoading('thread-2', false);
			expect(ctx.pendingThreadId).toBe('thread-1');

			ctx.setThreadLoading('thread-1', false);
			expect(ctx.pendingThreadId).toBeNull();
		});
	});

	describe('client / assistantId / error / hrefFor / labels setters', () => {
		test('client and assistantId round-trip through their setters', () => {
			const ctx = new LangGraphContext();
			expect(ctx.client).toBeUndefined();
			expect(ctx.assistantId).toBeUndefined();

			const client = makeMockClient();
			ctx.setClient(client);
			ctx.setAssistantId('assistant-1');

			// Not `toBe`: `#client` is a `$state` field, so Svelte wraps the assigned object in a
			// reactive proxy — `ctx.client` is structurally, not referentially, the same object.
			expect(ctx.client).toEqual(client);
			expect(ctx.assistantId).toBe('assistant-1');
		});

		test('error round-trips through setError', () => {
			const ctx = new LangGraphContext();
			expect(ctx.error).toBeUndefined();
			const err = new Error('resolution failed');
			ctx.setError(err);
			expect(ctx.error).toBe(err);
		});

		test('hrefFor and labels round-trip through their setters', () => {
			const ctx = new LangGraphContext();
			const hrefFor = (t: { id: string }) => `/threads/${t.id}`;
			ctx.setHrefFor(hrefFor);
			// Functions are stored as-is (`DeepPartial` preserves function-typed fields, and $state
			// does not proxy functions), so this one IS the same reference.
			expect(ctx.hrefFor).toBe(hrefFor);

			// Not `toBe`: `#labels` is a `$state` field, so the assigned object is wrapped in a
			// reactive proxy — structurally, not referentially, equal to what was passed in.
			const labels = { composer: { placeholder: 'Say something' } };
			ctx.setLabels(labels);
			expect(ctx.labels).toEqual(labels);
		});
	});
});

describe('useLangGraph / useLangGraphOptional', () => {
	test('useLangGraph() throws outside a provider', () => {
		expect(() => render(UseLangGraphProbe, { props: { required: true } })).toThrow(
			'useLangGraph() must be called within a <LangGraph> provider.'
		);
	});

	test('useLangGraphOptional() returns undefined outside a provider', () => {
		let result: unknown = 'not-called';
		render(UseLangGraphProbe, { props: { onResult: (ctx: unknown) => (result = ctx) } });
		expect(result).toBeUndefined();
	});
});
