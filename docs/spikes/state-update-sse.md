# Spike: Thread-level `state_update` SSE for Cross-Client Live Sync

**Date:** 2026-07-04  
**Status:** Complete  
**Question:** Can the `state_update` thread SSE event be used for cross-client live sync of LangGraph thread state, and does Aegra support it?

---

## 1. Server-side: When and how `state_update` is emitted

**Package:** `langgraph_api 0.9.0` at `apps/backend/.venv/lib/python3.12/site-packages/langgraph_api/`

### Trigger points — explicit `updateState` only

`state_update` is published in exactly two places, both inside `grpc/ops/threads.py`:

- **Single state update** (`Threads.State.post`, called by `POST /threads/{thread_id}/state`):  
  lines 1145–1151 — fires after `graph.aupdate_state()` succeeds and the thread is confirmed idle/interrupted/error.

- **Bulk state update** (`Threads.State.bulk`):  
  lines 1250–1256 — fires after `graph.abulk_update_state()` succeeds.

It is **not** emitted during normal run execution, at checkpoints, or on run completion. Runs emit their events on the run-level stream; the thread-level `state_update` is specifically a side-effect of calling the state-edit API.

### Payload shape

Both call sites publish:
```json
{
  "state": { /* result of state_snapshot_to_thread_state(state) */ },
  "thread_id": "<uuid-string>"
}
```

`state_snapshot_to_thread_state` converts a `StateSnapshot` to the `Thread` model's state fields (values, next, tasks, metadata, checkpoint, created_at, etc.) — the same shape as the `thread.values` you'd get from `GET /threads/{thread_id}/state`.

### Channel / endpoint

Published via `Runs.Stream.publish("*", "state_update", ..., thread_id=..., resumable=True)`.  
The `run_id="*"` marker routes it to the **thread-level** stream, not any specific run stream.

Consumed at: `GET /threads/{thread_id}/stream?stream_modes=state_update`  
(defined in `api/threads.py` line 576-578, handler at lines 507-541).

The `stream_modes` query parameter accepts a comma-separated list from:  
`"lifecycle" | "run_modes" | "state_update"` (schema.py:32).  
Default when omitted: `"run_modes"` — so callers must explicitly opt into `state_update`.

The endpoint reads `Last-Event-ID` from the request header (line 511) and passes it to `Threads.Stream.join`, which passes it to the gRPC layer for replay. Events marked `resumable=True` are buffered server-side with a TTL.

---

## 2. SDK client: `threads.joinStream`

**File:** `apps/frontend/node_modules/@langchain/langgraph-sdk/dist/client.d.ts` lines 537–545

```typescript
joinStream(threadId: string, options?: {
  lastEventId?: string;
  streamMode?: ThreadStreamMode | ThreadStreamMode[];
  signal?: AbortSignal;
}): AsyncGenerator<{
  id?: string;
  event: StreamEvent;
  data: any;
}>;
```

- `streamMode` defaults to `"run_modes"` server-side when omitted; pass `"state_update"` (or `["state_update", "lifecycle"]`) to opt in.
- `lastEventId` is the `id` field of the last received event — the server replays all buffered events after that ID on reconnect. This is the foundation for tab-reconnect / page-reload recovery.
- `signal` is an `AbortSignal` for cancellation.
- A parallel `RunsClient.joinStream(threadId, runId, ...)` exists for run-scoped streaming (line 665); the thread-level version is separate.

There is no built-in heartbeat logic in the SDK generator — the caller is responsible for reconnection on connection drop.

---

## 3. Aegra

**Repo:** `github.com/ibbybuilds/aegra` · lib path: `libs/aegra-api/src/aegra_api/`

**Findings — verified from source:**

| Feature | Status |
|---|---|
| `GET /threads/{thread_id}/stream` endpoint | **Absent** — `api/threads.py` has no streaming routes at all |
| `state_update` event type | **Absent** — not referenced anywhere in the codebase (searched via GitHub API) |
| `ThreadStreamMode` enum / stream mode filtering | **Absent** — `models/enums.py` defines only `RunStatus`, `ThreadStatus`, `MultitaskStrategy` |
| Thread-level pub/sub channel | **Absent** — `streaming_service.py` is run-scoped (`stream_run_execution(run, ...)`) |
| Cross-instance replay with `Last-Event-ID` | Present but run-scoped only — `redis_broker.py` buffers per `run_id` |

Aegra's `EventConverter._create_sse_event` handles: `updates`, `messages/*`, `values`, `debug`, `end`, `error`, and a catch-all for unknown modes (`format_sse_message` passthrough). No `state_update` path exists.

**Aegra verdict: UNVERIFIED support — confirmed absent.** Cross-client sync via `state_update` is not possible against Aegra without adding the endpoint and event emission from scratch.

---

## 4. Integration with `@langchain/svelte`'s `useStream`

The `useStream` hook (from `@langchain/svelte 0.x`) wraps a `StreamOrchestrator` internally. The orchestrator exposes `historyData: UseStreamThread<StateType>` — which has a `.mutate(mutateId?)` method that re-fetches thread history. However:

- `historyData` is **not surfaced** on the object returned by `useStream`. It is an internal orchestrator getter.
- The `@langchain/svelte` wrapper checks `orchestrator.historyData.isLoading` internally (line 129 of `index.js`) but does not re-export `historyData`.
- An upstream issue is planned to expose a public refresh API.

**Available workarounds (without waiting for upstream):**

**Option A — `thread` injection (cleanest, supported today).**  
`UseStreamOptions` accepts a `thread?: UseStreamThread<StateType>` prop (types.d.ts line 860). This lets the caller own the history fetch state externally:

```typescript
// In +page.svelte or a wrapping component
let historyState = $state<UseStreamThread<State>>({ data: null, error: null, isLoading: false, mutate });

// In the state_update listener
async function mutate(mutateId?: string) {
  historyState.isLoading = true;
  historyState.data = await client.threads.getHistory(threadId);
  historyState.isLoading = false;
  return historyState.data;
}

// Wire listener
async function startStateUpdateListener() {
  for await (const { event, data } of client.threads.joinStream(threadId, {
    streamMode: 'state_update',
    lastEventId: lastSeenId,
  })) {
    if (event === 'state_update') {
      await mutate(); // triggers useStream to re-render with new history
    }
    if (event.id) lastSeenId = event.id;
  }
}

const stream = useStream({ ..., thread: historyState });
```

This is architecturally sound: the external `mutate` re-fetches history and the `thread` prop makes `useStream` consume it.

**Option B — optimistic local mutate via callbacks.**  
The `onUpdateEvent`, `onStop`, and `onToolEvent` callbacks each receive a local `mutate(update)` function, but this only patches in-memory reactive state and does not persist or sync across clients. Unsuitable for cross-client sync.

**Option C — polling fallback.**  
Call `client.threads.getState(threadId)` on a 10–30s interval and drive the `thread` injection from that. Zero event infrastructure, works against Aegra today.

---

## 5. GO / NO-GO Recommendation

### Against official `langgraph-api` (0.9.0): CONDITIONAL GO

The plumbing is real and server-confirmed, but the scope is narrower than hoped:

- `state_update` fires only on **explicit user-triggered state edits** (`PATCH /threads/{id}/state`), not on AI run completion. The edit-message feature (SLG-28) is a perfect use case: Tab B will see Tab A's edit live.
- For cross-client sync of AI responses (Tab B seeing a completed AI run), you would need to additionally subscribe to `run_modes` on the thread stream and handle `lifecycle` events — or poll after run completion.
- Replay via `Last-Event-ID` works on reconnect, so the listener is resilient to page navigations.
- The `thread` injection API in `useStream` is a viable, documented integration point. No monkey-patching required.

**Recommended approach:** Implement a `useThreadSync` composable that opens a `joinStream("state_update,lifecycle")` connection per thread and calls the externally owned `mutate` on receipt. Wire it into the `thread` prop of `useStream`. Gate the feature behind a capability flag so it degrades gracefully (falls back to polling) when the server doesn't support the endpoint.

### Against Aegra: NO-GO (missing infrastructure)

Aegra lacks the thread-level stream endpoint and the `state_update` emission entirely. Building cross-client sync against Aegra requires:

1. Adding `GET /threads/{thread_id}/stream` with a Redis-backed thread-scoped broker.
2. Emitting a `state_update`-equivalent event from `thread_state_service.py` on state mutations.

This is non-trivial (estimated 2–3 days of Aegra work). The feature should be treated as "not available on Aegra" until those contributions land.

### Risk summary

| Risk | Severity | Mitigation |
|---|---|---|
| `state_update` doesn't fire on run completion | Medium | Subscribe `lifecycle` or `run_modes` too, or poll after `stream.isLoading` flips |
| `historyData.mutate` not public in `useStream` | Medium | Use `thread` injection option (available today) |
| Server-side replay TTL unknown | Low | Implement reconnect with `Last-Event-ID`; worst case is a missed event that polling catches |
| Aegra incompatibility | High (for Aegra users) | Feature flag; fall back to polling |
| Connection multiplicity (each tab opens a SSE connection) | Low | One SSE per thread per tab; this is the expected pattern |
