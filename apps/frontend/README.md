# sv

> **Monorepo note:** This app is part of the svelte-langgraph monorepo. See the [root README.md](../../README.md) for development setup (Proto + moon).

Svelte frontend project.

## Getting started

### Requirements

- Proto (installs pinned moon and pnpm via `.prototools`)
- Node 24 LTS (managed by moon/proto)

From the **repo root**, run `proto install` then use moon tasks — do not rely on `pnpm install` or `npm run dev` at the monorepo root.

### Developing

Start the frontend dev server from the repo root:

```bash
moon frontend:dev
```

Or start the full local stack (frontend, backend, and OIDC mock):

```bash
moon :dev :oidc-mock
```

You can also use npm scripts from this directory if needed:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

---

## Generic state synchronisation (`createStateSync`)

`@svelte-langgraph/client` (`packages/client/`) contains a runtime-schema-driven state-sync
primitive built on Svelte 5 runes.

### Usage

```svelte
<script lang="ts">
	import { createStateSync } from '@svelte-langgraph/client';
	import StateField from '$lib/components/StateField.svelte';

	// stream is the return value of useStream(); client and assistantId come from props
	const sync = createStateSync({ stream, client, assistantId });
</script>

<!-- Renders an enum <select> for the 'phase' field; renders nothing while schema loads -->
<StateField name="phase" field={sync.field('phase')} label="Phase" />
```

`sync.schema` is a reactive `SchemaStatus` value:

| Status                      | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `{ status: 'loading' }`     | Schema fetch in flight                                     |
| `{ status: 'ok', fields }`  | Schema loaded; `fields` is a `Record<string, FieldSchema>` |
| `{ status: 'unavailable' }` | Schema absent or fetch failed                              |

`sync.field(name)` returns a `FieldBinding` with reactive getters:

- **`value`** — current value from `stream.values`; `undefined` on a fresh thread.
- **`schema`** — parsed `FieldSchema` (or `undefined` while loading/unavailable).
- **`options`** — enum options (`string[]`), empty for non-enum or while loading.
- **`set(v)`** — write a new value via a graph-mediated submit (see below).

### Graph-mediated write path

`field.set(v)` calls `stream.submit({ [name]: v }, { optimisticValues: prev => ({ ...prev, [name]: v }) })`.

This triggers a _state-only run_ through the graph: the backend's `phase_gate`
middleware (a `@before_agent` hook in `graph.py`) applies the new field value and
jumps to `end` without invoking the LLM. `useStream` refetches server
truth once the run completes (this refetch requires `fetchStateHistory: true` — or a
number — in the `useStream` options, as used in `Chat.svelte`). The `optimisticValues`
callback gives an immediate UI update while the round-trip is in flight.

Submitting while `stream.isLoading` is true enqueues the call via useStream's built-in
queue — acceptable for lightweight state-only writes. Note that `optimisticValues` is
not applied on the queued path; the UI updates when the queued run completes.

Caveats of graph-mediated writes:

- **"State-only" depends on the `state_only_submit` marker.** `field.set()` sends that
  marker in run config, so `phase_gate` ends the run without an LLM call even when
  checkpoint state still ends in a dangling HumanMessage (e.g. a prior generation was
  cancelled or failed). A state write submitted _without_ the marker falls back to the
  last-message heuristic — the agent runs whenever the thread's last message is a human
  message — and will trigger a generation for that dangling message.
- **Checkpoint branching rewinds synced fields.** Regenerating or editing a message
  branches from an earlier checkpoint, restoring the _entire_ state at that point — a
  field changed after the original response is reverted on the new branch.
- **Concurrent tool writes need a reducer.** If a tool can write a synced field via
  `Command(update={...})` (like the demo `change_phase` tool), the backend's state
  field must declare a reducer — e.g. `phase: Annotated[Phase, last_value]` in
  `graph.py`, using `svelte_langgraph/reducers.py`'s `last_value`. Without one, two
  calls to that tool inside a single assistant message (parallel tool calls) crash
  the run with LangGraph's `InvalidUpdateError`, because `ToolNode` runs tool calls
  concurrently and only merges `Command`s that target the parent graph. `last_value`
  resolves concurrent writes to the most recently produced one — matching the
  intuitive "last instruction wins" reading of a multi-step user request.

### Degraded mode

If `client.assistants.getSchemas` fails (network error, 404, etc.) or returns a `null`
`state_schema`, `sync.schema.status` becomes `'unavailable'`. `StateField` renders
nothing in that case — the chat continues to work normally. No explicit error handling
is needed in consuming components.

### `threads.updateState` — expert escape hatch

`client.threads.updateState` can bypass the graph and write directly to the thread
checkpoint. It is deliberately **not** used by `createStateSync` due to these hazards:

- **No server-side validation** — the write bypasses the graph, so `phase_gate` never
  runs to reject it. The bad value is checkpointed and then fails every subsequent run
  until a valid value is written.
- **HTTP 409 during runs** — calling it while a run is active raises a conflict error.
- **Invisible to `useStream`** — the live stream ignores the write until the next reconnect.
- **Checkpoint forking** — the next `stream.submit` call branches from the wrong checkpoint.

Use `threads.updateState` only when you need out-of-band state surgery and are prepared
to handle all of the above.
