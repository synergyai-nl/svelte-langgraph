# Upstream issue: public API to reconcile thread state after external writes (@langchain/svelte)

> Status: FILED as https://github.com/langchain-ai/langgraphjs/issues/2589 (2026-07-04).
> Target repo: langchain-ai/langgraphjs (package `@langchain/svelte` lives in `libs/sdk-svelte`).

---

**Title:** Svelte `useStream`: no public API to reconcile thread state after external writes (`threads.updateState`, other clients)

## What we verified (facts)

Checked against the released package `@langchain/svelte@0.3.1` (+ its `@langchain/langgraph-sdk` dependency), reading the shipped `dist/`:

- The hook delegates to `StreamOrchestrator`, whose public `historyData` getter returns a
  `UseStreamThread<StateType>` including
  `mutate: (mutateId?: string) => Promise<ThreadState<StateType>[] | null | undefined>` —
  documented in `dist/ui/orchestrator.d.ts` as "a mutate function to manually re-fetch".
- The object returned by the Svelte `useStream` (`@langchain/svelte/dist/index.js`) exposes
  `values`, `messages`, `submit`, `stop`, `joinStream`, `switchThread`, `queue`, branch APIs, …
  but nothing backed by `historyData` — there is no public way to trigger a history re-fetch.
- Consequence: state written outside the hook's own `submit()` lifecycle
  (`client.threads.updateState(...)` from the same page, another tab/client, a background run)
  is not reflected in `stream.values` and there is no supported way to ask the hook to re-sync.

Also verified: on current `main`, the package was rewritten (v1.0.x, "v2-native stream runtime"):
`libs/sdk-svelte/src/use-stream.svelte.ts` now wraps a `StreamController` and exposes
`getThread(): ThreadStream | undefined` for "low-level protocol access (raw subscriptions,
state commands, etc.)"; `ThreadStream` (`libs/sdk/src/client/stream/index.ts`) is a
channel-subscription protocol (SSE/WS). A text search of the current `use-stream.svelte.ts`
finds no `refetch`/`refresh`/`reload`/`mutate` member on the returned handle.

## What we suspect (not verified)

- That the next `submit()` after an unseen external write pins the client-side checkpoint
  head and forks the external write onto a dead branch — inferred from reading the 0.3.1
  orchestrator source, not reproduced end-to-end.
- That the v2 `ThreadStream` channel subscriptions do not (yet) push externally-initiated
  state updates (e.g. a thread-level `state_update` event) to an idle subscribed client —
  we have not traced the full v2 server/client protocol.
- That `switchThread(sameId)` works as a re-fetch workaround — unknown side effects.

## Ask

1. For the v2 runtime: is reconciliation after external writes an intended capability of
   `ThreadStream` subscriptions? If yes, a documented recipe on the Svelte handle would be
   enough. If no:
2. Expose an explicit, public "re-sync from server" affordance on the `useStream` handle
   (e.g. `stream.refetchHistory()` — in 0.3.x this is a one-liner delegating to
   `orchestrator.historyData.mutate()`), reactive loading/error state optional.

Use cases: reflecting `threads.updateState` writes, cross-tab/cross-client sync,
background runs completing while the client is idle.

Happy to send a PR if either direction is acceptable.

---

## Notes for us (svelte-langgraph)

- Needed for: reconciling external `updateState` writes, and the cross-client
  live-sync direction explored in `docs/spikes/state-update-sse.md`.
- Until upstream lands, workarounds are: full remount, `switchThread(sameId)`
  (unverified side effects), or graph-mediated writes only (our current approach —
  `createStateSync` submits state deltas through the graph, so the hook reconciles
  on its own).
