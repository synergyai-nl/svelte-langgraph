# sv

Svelte frontend project.

## Getting started

### Requirements

- pnpm
- Node 24 LTS

### Install deps

```bash
pnpm install
```

### Developing

Once you've created a project and installed dependencies, start a development server:

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

`src/lib/langgraph/` contains a runtime-schema-driven state-sync primitive built on Svelte 5 runes.

### Usage

```svelte
<script lang="ts">
	import { createStateSync } from '$lib/langgraph/stateSync.svelte.js';
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

This triggers a _state-only run_ through the graph: the backend entry router applies
the new field value and exits without invoking the LLM. `useStream` refetches server
truth once the run completes (this refetch requires `fetchStateHistory: true` — or a
number — in the `useStream` options, as used in `Chat.svelte`). The `optimisticValues`
callback gives an immediate UI update while the round-trip is in flight.

Submitting while `stream.isLoading` is true enqueues the call via useStream's built-in
queue — acceptable for lightweight state-only writes. Note that `optimisticValues` is
not applied on the queued path; the UI updates when the queued run completes.

Caveats of graph-mediated writes:

- **"State-only" depends on the router seeing merged state.** The demo router routes to
  the agent whenever the thread's _last message_ is a human message. If the previous run
  errored or was cancelled before an AI message was committed, a field write will also
  trigger a generation for that dangling message.
- **Checkpoint branching rewinds synced fields.** Regenerating or editing a message
  branches from an earlier checkpoint, restoring the _entire_ state at that point — a
  field changed after the original response is reverted on the new branch.

### Degraded mode

If `client.assistants.getSchemas` fails (network error, 404, etc.) or returns a `null`
`state_schema`, `sync.schema.status` becomes `'unavailable'`. `StateField` renders
nothing in that case — the chat continues to work normally. No explicit error handling
is needed in consuming components.

### `threads.updateState` — expert escape hatch

`client.threads.updateState` can bypass the graph and write directly to the thread
checkpoint. It is deliberately **not** used by `createStateSync` due to these hazards:

- **No server-side validation** — the graph's entry router cannot reject invalid state.
- **HTTP 409 during runs** — calling it while a run is active raises a conflict error.
- **Invisible to `useStream`** — the live stream ignores the write until the next reconnect.
- **Checkpoint forking** — the next `stream.submit` call branches from the wrong checkpoint.

Use `threads.updateState` only when you need out-of-band state surgery and are prepared
to handle all of the above.
