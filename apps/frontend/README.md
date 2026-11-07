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

## Installing the chat UI from the registry

The chat components (`src/lib/components/chat/`) are published as a
[shadcn-svelte custom registry](https://www.shadcn-svelte.com/docs/registry) item, `chat`.
`moon frontend:registry-build` builds `registry.json` into `static/r/` (gitignored; `build`
and `dev` run it first), so the frontend serves the item at `/r/chat.json`.

### Requirements

- SvelteKit **2**. SvelteKit 3 is not supported yet
  ([#326](https://github.com/synergyai-nl/svelte-langgraph/issues/326)). Current `sv create`
  (1.x) scaffolds Kit 3; scaffold a new consumer with `pnpm dlx sv@0.17.1 create` until then.
- Tailwind CSS v4, with shadcn-svelte initialised (`shadcn-svelte init`).
- Paraglide.

### Steps

1. Install the item:

   ```bash
   pnpm dlx shadcn-svelte@latest add https://svelte-langgraph-demo.synergyai.nl/r/chat.json
   ```

   That URL serves the item built from `main`. Re-running `add` updates it, and reverts any
   local patches to the files it ships.

   This copies the components into `$lib/components/chat/`, the client library into
   `$lib/svelte-langgraph-client/`, pulls in the upstream shadcn-svelte UI components they
   use, and writes the chat strings to `messages/svelte-langgraph/{locale}.json`.

   The item ships no copies of shadcn-svelte UI components: the chat uses your stock ones,
   including `sidebar` and `spinner`, and copies through the `use-clipboard` hook. The thread
   list draws its own sidebar shell (`ThreadListPanel`), so it fits any container; it only needs
   a stock `Sidebar.Provider` around it (see "Thread list layout" below).

   The CLI asks about overwriting per item: `chat`, then each stock component it depends on
   (`button`, `card`, `dialog`, `input`, `separator`, `sheet`, `sidebar`, `skeleton`,
   `spinner`, `textarea`, `tooltip`, and the `is-mobile` and `use-clipboard` hooks).
   Answer No to "overwrite all" to decide item by item, and decline the stock components you
   customised: the chat only uses their stock variants and sizes. `-y` does not answer the
   overwrite prompts, and they default to Yes, so read them before pressing Enter. A
   non-interactive run needs `-y -o`, which overwrites everything; follow it with `git restore`
   on the components you customised.

   `ThreadList`, `Conversation` and `ChatSurface` must be rendered inside `<LangGraph>` and throw
   at init otherwise, the same way shadcn's `Sidebar.*` parts require `Sidebar.Provider`.

2. Point `@svelte-langgraph/client` at the installed library with a SvelteKit `alias` entry,
   wherever your Kit config lives. Apps from `sv create` 0.17 or newer have no
   `svelte.config.js`: pass it to `sveltekit()` in `vite.config.ts`:

   ```ts
   sveltekit({
   	// ...your existing options
   	alias: {
   		'@svelte-langgraph/client': 'src/lib/svelte-langgraph-client'
   	}
   });
   ```

   With a `svelte.config.js`, add it to your existing `kit.alias` object (or create one)
   instead. Kit ignores `svelte.config.js` once `sveltekit()` receives options, so put it in
   only one place.

   The path must match your shadcn-svelte `lib` alias if you customised it. The chat
   components import the client by its package name; this alias is temporary until the client
   is published to npm (after 1.0, see
   [#326](https://github.com/synergyai-nl/svelte-langgraph/issues/326)).

3. Register the typography plugin in your app CSS (the item installs `@tailwindcss/typography`,
   which `ChatMessage` uses for its `prose` classes, but cannot register it for you):

   ```css
   @plugin '@tailwindcss/typography';
   ```

4. Load those messages alongside your own: in `project.inlang/settings.json`, make
   `pathPattern` an array (needs `@inlang/plugin-message-format` 4.5.0 or newer):

   ```json
   "plugin.inlang.messageFormat": {
   	"pathPattern": ["./messages/{locale}.json", "./messages/svelte-langgraph/{locale}.json"]
   }
   ```

   Then run `vite dev` or `vite build` once (or `paraglide-js compile`), so the chat messages
   are compiled before you run `svelte-check`.

5. Edit the chat UI's strings in `messages/svelte-langgraph/{locale}.json`. The item ships `en`, `nl` and
   `hi`, and Paraglide compiles only the `locales` in your settings: delete the files for
   locales you don't ship (the next `add` restores them), or add the locale to `locales`.
   Add a new locale by adding its file there and to `locales`.
   Every chat key is prefixed `slg_` (`m.slg_cancel()`), so it cannot collide with your own keys:
   Paraglide's message-format plugin merges every `pathPattern` file and the last file wins silently,
   so an unprefixed shared key would shadow your app's own string.
   If you overrode strings under the old unprefixed names, rename those keys.

6. Tidy up after the add:
   - **Prettier.** `prettier-plugin-tailwindcss` re-sorts the `prose` classes once the
     typography plugin from step 3 is registered. Run Prettier over the installed files after
     each add.
   - **ESLint.** `ThreadListItem` renders an `<a href>` from `hrefFor`, which must return a
     resolved path. `svelte/no-navigation-without-resolve` flags it; turn the rule off for
     `src/lib/components/chat/**` (the same override you may already have for `ui/**`).
   - **Font weights.** The components use `font-medium`: `ChatToolMessage` (three times),
     `SuggestionCard`, and the stock `dialog-title`, `sidebar-group-label` and
     `sidebar-menu-button` (the active row). If your app has a weight policy, patch them after
     each add.
   - **Dependencies.** The add rewrites the version ranges of packages you already have to the
     item's, even downgrades (`@lucide/svelte` `^1.x` becomes `^0.562.0`, `tailwind-variants`
     `^4` becomes `^3`), and adds the missing ones, most under `dependencies`. Check
     `package.json` after each add and restore your ranges. An adapter-node app that ships
     without `node_modules` keeps the packages under `devDependencies`.

### Backend routes

Besides the LangGraph API, the client calls `POST {url}/titles` and `POST {url}/feedback`,
custom routes of this repo's demo backend. Without them, thread titles stay as dates, and
the rating buttons stay disabled: a message is only rateable when its
`response_metadata.run_id` is set, which the demo backend stamps per run.
See "Feedback architecture and upstream migration" in
[`apps/backend/README.md`](../backend/README.md) for what to port.

### Minimal usage

A bounded-height container holding the provider, and a child that creates the first thread and
renders `ChatSurface` (which fills and scrolls inside the container). `<LangGraph>` builds its
client only when `token` is truthy; pass a pre-built `client` instead otherwise. Set `graph` to
your server's graph id: the key under `graphs` in your `aegra.json` or `langgraph.json`. It
defaults to `'chat'`, which only fits servers that use that key. A wrong id fails assistant
resolution: `ctx.error` is set and `ChatSurface` keeps showing its loader, so render the error
yourself (as below). The token is sent as a bearer token: send whatever your backend validates,
normally an access token for your API's audience. Which token that is depends on your backend's
auth handler.

```svelte
<!-- +page.svelte -->
<script lang="ts">
	import { env } from '$env/dynamic/public';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import Chat from './Chat.svelte';

	let { data } = $props(); // however your app exposes the token your backend validates
</script>

<div class="h-[32rem] w-full max-w-md overflow-hidden rounded-xl border">
	<LangGraph url={env.PUBLIC_LANGGRAPH_API_URL} token={data.accessToken} graph="chat">
		<Chat />
	</LangGraph>
</div>
```

```svelte
<!-- Chat.svelte: must be a child of <LangGraph> to read its context -->
<script lang="ts">
	import ChatSurface from '$lib/components/chat/ChatSurface.svelte';
	import { useLangGraph } from '$lib/components/chat/langGraphContext.svelte.js';

	const ctx = useLangGraph();

	// Without a router, nothing selects a thread: create the first one. The error gate stops a
	// failed creation from retrying forever.
	$effect(() => {
		if (ctx.client && !ctx.activeThreadId && !ctx.creatingThread && !ctx.createThreadError) {
			ctx.createThread();
		}
	});
</script>

{#if ctx.error}
	<p role="alert">
		Could not connect. <button onclick={() => ctx.retryResolution()}>Try again</button>
	</p>
{:else if ctx.createThreadError}
	<p role="alert">
		Could not start a chat. <button onclick={() => ctx.createThread()}>Try again</button>
	</p>
{:else}
	<ChatSurface />
{/if}
```

Full reference: [`+page.svelte`](src/routes/demo/embedded/+page.svelte) and
[`EmbeddedChatSurface.svelte`](src/routes/demo/embedded/EmbeddedChatSurface.svelte) of the
embedded demo.

`<LangGraph>` takes no layout props and renders no element of its own: its children land in
your markup as is, inside a `Tooltip.Provider` with no delay.

### Thread list layout

`ThreadList` needs a stock `Sidebar.Provider` above it, which you own, as in shadcn;
`ChatSurface` is just the conversation pane and renders none. Put `ThreadList` and your content
pane side by side as the provider's direct children, with a `Sidebar.Trigger` in the pane: on
mobile it is the only way to open the thread list's drawer. Stock `Sidebar.Provider` is
`min-h-svh`; inside a bounded container, pass `class="h-full min-h-0"` so it fills the container
instead of the viewport. The provider brings the Cmd/Ctrl+B shortcut and the `sidebar_state`
cookie. Both come from your stock `ui/sidebar` (`constants.ts`), not from the chat, so the chat does
not prefix them. Every stock provider uses the same cookie name and listens for the same shortcut
on `window`, so a second `Sidebar.Provider` in your app writes that cookie too and also toggles on
Cmd/Ctrl+B.

```svelte
<script lang="ts">
	import { env } from '$env/dynamic/public';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import ChatSurface from '$lib/components/chat/ChatSurface.svelte';
	import { ThreadList } from '$lib/components/chat/ThreadList';

	let { data } = $props();
</script>

<!-- Rows pick a thread and "New chat" creates one; ChatSurface follows the selection. -->
<LangGraph url={env.PUBLIC_LANGGRAPH_API_URL} token={data.accessToken}>
	<Sidebar.Provider class="h-full min-h-0">
		<ThreadList />
		<div class="flex min-w-0 flex-1 flex-col">
			<Sidebar.Trigger />
			<ChatSurface />
		</div>
	</Sidebar.Provider>
</LangGraph>
```

Full reference: [`routes/chat/+layout.svelte`](src/routes/chat/+layout.svelte), which also
seeds the provider's `open` from the cookie (`bind:open`).

### Test-install from a local checkout

`moon frontend:dev` builds the item first, so with it running, in the consumer project run:

```bash
pnpm dlx shadcn-svelte@latest add http://localhost:5173/r/chat.json
```

The CLI only accepts URLs, not file paths.

Without the dev server, build and serve only the item: `moon frontend:registry-build`, then
`python3 -m http.server 4877 -d apps/frontend/static/r`, and add
`http://localhost:4877/chat.json`.

---

## Generic state synchronisation (`createStateSync`)

`@svelte-langgraph/client` (`packages/client/`) contains a runtime-schema-driven state-sync
primitive built on Svelte 5 runes.

### Usage

```svelte
<script lang="ts">
	import { createStateSync } from '@svelte-langgraph/client';
	import StateField from '$lib/components/chat/StateField.svelte';

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
number — in the `useStream` options, as used in `Conversation.svelte`). The `optimisticValues`
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
