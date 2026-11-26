# Upstream issue: public API to re-read thread state in place (@langchain/svelte)

> Status: FILED as https://github.com/langchain-ai/langgraphjs/issues/2589 (2026-07-04), against
> `@langchain/svelte` 0.3.1. Facts below re-checked against `@langchain/svelte` 1.2.15 with
> `@langchain/langgraph-sdk` 1.17.0, the pair this repo uses.
> Target repo: langchain-ai/langgraphjs (package `@langchain/svelte` lives in `libs/sdk-svelte`).

---

**Title:** Svelte `useStream`: no public API to re-read thread state in place

## What we verified (facts)

Read from the shipped `dist/` of `@langchain/svelte` 1.2.15 and `@langchain/langgraph-sdk` 1.17.0:

- `useStream` wraps a `StreamController` (`use-stream.svelte.js`). The handle exposes `values`,
  `messages`, `submit`, `stop`, `disconnect`, `respond`, `respondAll`, `getThread`, `client` and
  the discovery maps. None of them re-reads the thread state.
- `StreamController.hydrate()` (`stream/controller.js`) does: for the same thread id it reads
  `threads.getState()` again without a teardown, applies the values and drops optimistic messages
  the server state lacks. It is reachable only through the `STREAM_CONTROLLER` symbol, which the
  binding documents as internal.
- A `threadId` getter that returns the same id does nothing (`use-stream.svelte.js`: the effect
  returns early when the id is unchanged).
- After a failed run the controller does not re-read the state: a message marked `failed`
  stays `failed` until the next hydrate, even when the server stored it.

## Ask

Expose `hydrate()` (or a `refresh()` delegating to it) on the Svelte handle, with the existing
`isThreadLoading` as its loading state.

Use cases: reconciling after a failed or lost run response before a retry, reflecting writes
made outside the hook (`threads.updateState`, another client), background runs that ended while
the page was idle.

---

## Notes for us (svelte-langgraph)

- Needed by Retry (the Retry issue #444): read the stored state, then decide whether to resend.
- Until upstream lands: a remount (`{#key}`), or `client.threads.getState(threadId)` read
  separately. `createStateSync` writes state through the graph, so it needs neither.
