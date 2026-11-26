# Upgrade notes for downstream apps

This page is for two kinds of readers:

- Apps that copied or ported this backend: the `auth` package, `http.py`, `graph.py`, the Dockerfile or `aegra.json`. This includes the frontend auth helpers.
- Apps that installed the chat item from the registry.

There are no version numbers, because the code is distributed off `main`. Entries are keyed by date and PR number, newest first.

Each entry has this format:

- Heading: `## YYYY-MM-DD — <title that says what changed> (#PR)`, with the PR number linked.
- **What changed**: one or two sentences.
- **Who is affected**: which downstream apps need to act.
- **What to do**: numbered steps.
- **How to check**: one command or request.

## 2026-11-26 — The chat runs on `@langchain/svelte` 1.x, `@langchain/langgraph-sdk` 1.17 and Agent Protocol v2 ([#PRNUM](https://github.com/synergyai-nl/svelte-langgraph/pull/PRNUM))

**What changed.** The `chat-core` registry item now asks for `@langchain/svelte` `^1.2.15` (was `^0.3.1`) and `@langchain/langgraph-sdk` `^1.17.0` (was `^1.8.3`). The binding pins the SDK at 1.17.0 and declares `@langchain/core` `^1.1.48` and `svelte` 5 as peers; the SDK declares `@langchain/core` `^1.3.2`. Together: `svelte` 5 and `@langchain/core` `^1.3.2`. Its `useStream` is a different runtime that talks Agent Protocol v2 to the server: runs start with `POST /threads/{id}/commands` (`run.start`) and are followed on the `POST /threads/{id}/stream/events` event stream, not `/runs/stream`. A thread loads from `GET /threads/{id}/state`. What the chat does differently:

- A conversation opened while its thread has a run going joins that run and shows the reply, after a reload, on coming back to it, or in a second tab. The composer is busy until the run ends. A run started in another tab after the conversation opened, on a thread that was idle then, is not followed. A send from such a page is accepted and runs next to the other run; on Aegra 0.12 the run that ends last decides the thread's state, so the other exchange drops out of it (the run-started-after-mount issue [#460](https://github.com/synergyai-nl/svelte-langgraph/issues/460)).
- Leaving a conversation mid-run no longer cancels the run: unmounting `Conversation` stops listening and the run finishes. The Stop button still cancels.
- Stop drops the unfinished, uncheckpointed part of the reply; finished messages stay. The binding offers no option to keep it (`stop()` takes only `cancel`). It used to stay on screen until a reload.
- The stream shows a sent message at once and sends it with an `id`: `Conversation` sets one, and the SDK adds `additional_kwargs: {}` and `response_metadata: {}`.
- A message whose run ended before the client saw the server echo it (a send refused with a 401 or by the run input check, or a run stopped that early) leaves the list. For a plain send, `Conversation` also puts the text back in the composer. One case looks the same: the server stored the message but the client lost the response; then a stored message is hidden until a remount, and a resend stores it twice. The Retry issue [#444](https://github.com/synergyai-nl/svelte-langgraph/issues/444) reconciles with the stored thread state before resending. A submit that fails while setting up the thread, before the message shows, keeps the text in the composer and shows the error card. An edit's text is not put back (the edited-text issue [#403](https://github.com/synergyai-nl/svelte-langgraph/issues/403)); the list shows the old branch. A run that fails after the server echoed the message keeps it, and the composer stays empty.
- `ConversationApi.edit` returns `Promise<boolean>` (was `boolean`). It reads the thread history (`POST /threads/{id}/history`, 20 checkpoints per request, further pages only for an older message) to find the checkpoint to fork from. When the read fails or the message is not on the current branch, it shows the error card, keeps the editor open with the text, and resolves `false`; a regenerate shows the error card and starts nothing. Nothing shows busy during that read. `MessagesList`'s and `ChatMessage`'s `onEdit` take the same type. `regenerate` reads the history the same way.
- `api.submit(text)` is a no-op while `api.isThreadLoading`, as `api.submit()` already was. `MessageComposer` has a new `disabled` prop, which turns the input and Send off as a run does; `Conversation`'s composer sets it while the history loads.
- `MessagesList` animates a message in, not out: one that leaves the list (an edit's old branch, an unstored send) goes at once. With the outro, the old branch's messages stayed in the list after an edit, inert.
- `createStateSync`'s `StreamLike.submit` takes `multitaskStrategy` instead of `optimisticValues`. `field.set()` enqueues behind a running turn, which the stream's default would cancel.
- Every `run.start` carries `config.configurable.thread_id`, and an edit or regenerate also carries `config.configurable.checkpoint_id`. `run_input.py` allows both as strings, and refuses a `thread_id` other than the route's thread. Its `ALLOWED_CHECKPOINT_KEYS` holds only `checkpoint_id`: the client sends no `checkpoint` field, and Aegra builds one from `configurable.checkpoint_id`.
- An answer's rating buttons turn on when the run's `values` event carries the backend's run id, not when the streamed message arrives.
- `@svelte-langgraph/client` exports `findForkPoint(client, threadId, messageId)`.

The item ships the new `Conversation.svelte`, `ChatMessage.svelte`, `MessageComposer.svelte`, `MessagesList.svelte`, `svelte-langgraph-client/client.ts` and `svelte-langgraph-client/stateSync.svelte.ts`.

**Who is affected.** Apps that installed the chat item; apps that copied `auth/run_input.py`; apps that call `api.edit` or `api.submit(text)` from their own composer, pass their own `onEdit`, or use `createStateSync` or `@langchain/svelte` directly; backends that do not serve the v2 routes.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`). The CLI reinstalls `@langchain/langgraph-sdk` and `@langchain/svelte` at the new ranges. Keep your own SDK range resolving to 1.17.0, the version the binding pins, so one copy is installed. The item does not list `@langchain/core`: if your `package.json` declares it below `^1.3.2` (the SDK's peer; the binding's is `^1.1.48`), raise it and run your package manager's install.
2. Serve Agent Protocol v2. Aegra 0.12 is the version tested, and the first whose v2 commands apply the `create_run` auth handler fully ([GHSA-w5hm-3qhp-8mqp](https://github.com/aegra/aegra/security/advisories/GHSA-w5hm-3qhp-8mqp)); its routes are on unless `FF_V2_EVENT_STREAMING=false`. A route filter or proxy in front of the server must pass every route the chat calls: `POST /threads/{id}/commands`, `POST /threads/{id}/stream/events` (an event stream that stays open), `GET /threads/{id}/state`, `POST /threads/{id}/history` and `POST /threads/{id}/runs/{run_id}/cancel`, besides the thread routes of the thread list. When they are missing:
   - With the flag off, Aegra answers both v2 routes with HTTP 503 and `Agent Protocol v2 event streaming is disabled on this server (FF_V2_EVENT_STREAMING=false). Set FF_V2_EVENT_STREAMING=true to enable.` Every send shows the chat's error card and puts the text back. A conversation opened on a running thread shows the error once the stream gives up reconnecting (5 attempts).
   - A server without the routes answers 404 (or 405). A send fails the same way, at once; the event stream does not retry a 404 or 405.
3. If you copied `auth/run_input.py`, add `"thread_id": str` and `"checkpoint_id": str` to `ALLOWED_CONFIGURABLE_KEYS`, with the check in `validate_run_input` that refuses a `configurable.thread_id` other than the route's thread, and reduce `ALLOWED_CHECKPOINT_KEYS` to `checkpoint_id`. If your backend validates input messages, let them carry `id`, `additional_kwargs` and `response_metadata`.
4. If you call `api.edit` or pass your own `onEdit`, await it. If your own composer calls `api.submit(text)`, disable it while `api.isThreadLoading`, or pass `disabled={api.isThreadLoading}` to `MessageComposer`.
5. If you call `useStream` yourself, follow `@langchain/svelte` 1.x: there is no `joinStream`, `switchThread`, `getMessagesMetadata`, `branch` or `history`; fork with `submit(input, { forkFrom })`; `onError` gets the error only.
6. An `onRequest` hook that rewrote `/runs/stream` bodies now sees `/commands` bodies, with the run input under `params.input`.
7. If your app relied on leaving a page to cancel a run, call `api.stop()` before you navigate away.

**How to check.** Run `moon run e2e:test -- src/chat.spec.ts`. In your app, start a long reply and reload: the reply finishes, and the composer is usable afterwards. Open another thread mid-reply: the run on the first thread still ends with status `success` in `GET /threads/{id}/runs`.

## 2026-11-26 — Thread helpers take the graph id; `<LangGraph threadList={false}>` ([#456](https://github.com/synergyai-nl/svelte-langgraph/pull/456))

**What changed.**

- `createThread(client, graphId, metadata?)` and `getOrCreateThread(client, graphId, { threadId?, metadata? })` take the graph id, which they used to hard-code as `'chat'`. They now pass it as the SDK's `graphId`; the old `metadata: { graph_id: 'chat' }` never reached the server, because the SDK overwrote it with the missing `graphId`.
- A thread is listed from its creation, not from its first run (Aegra tags a thread with its assistant's graph on every run, so untagged threads were listed once they had run). A "New chat" without a message now leaves an empty row. Each `/demo/embedded` visit creates a thread that now shows in the same user's `/chat` list, and `/chat`'s `getOrCreateThread` now reuses an empty idle thread where it used to create another untagged one per visit.
- With `assistantId` and no `graph`, new threads are tagged `'chat'` and drop out of the list once the server re-tags them with the assistant's real graph: set `graph` to the assistant's graph.
- `getOrCreateThread` with `threadId` creates that thread if it is missing and returns it otherwise (`ifExists: 'do_nothing'`). `metadata` is written only on creation; `graph_id` wins over the same key in it.
- `ThreadListState.setClient(client, graphId)` takes the graph whose threads it lists; a new graph reloads the list. `LangGraphContext.setClient(client, graph)` likewise, and `ctx.graph` reads it.
- `<LangGraph threadList={false}>` sends no thread search; titles still follow `titles`. `/demo/embedded` sets both to `false`.

The `chat-core` registry item ships the new `LangGraph.svelte`, `langGraphContext.svelte.ts`, `svelte-langgraph-client/client.ts` and `svelte-langgraph-client/threadListState.svelte.ts`.

**Who is affected.** Apps that call `createThread`, `getOrCreateThread`, `ThreadListState.setClient` or `LangGraphContext.setClient` themselves, and apps that pass `assistantId` without `graph`. Apps without a thread list may opt out of its requests. Other apps need not act.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`).
2. Pass your graph id to those calls: `getOrCreateThread(ctx.client, ctx.graph)` inside `<LangGraph>`. If you pass `assistantId`, also pass `graph` naming that assistant's graph.
3. Without a thread list, set `<LangGraph threadList={false}>` (and `titles={false}` unless you read `metadata.title`). To open a thread whose id you know, see "One conversation on your own thread" in `apps/frontend/README.md`.

**How to check.** Run `moon run client:test -- src/client.test.ts src/threadListState.svelte.test.ts`. In your app with `threadList={false}`, the browser's network panel shows no request to `/threads/search` after sending a message.

## 2026-11-26 — `createClient` and `<LangGraph>` take the SDK's `onRequest` hook ([#455](https://github.com/synergyai-nl/svelte-langgraph/pull/455))

**What changed.** `createClient(url, token?, headers?, options?)` takes `options.onRequest`, and `<LangGraph>` an `onRequest` prop that it passes on. It is the SDK's own `RequestHook`: it runs once per SDK request after the bearer is set (HTTP retries reuse its result; stream reconnects call it again) and may return a changed `RequestInit`. The title and feedback routes do not pass through it.

The `chat-core` registry item ships the new `LangGraph.svelte` and `svelte-langgraph-client/client.ts`.

**Who is affected.** Apps that pass their own `client` to `<LangGraph>` only to change outgoing requests. Other apps need not act.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`).
2. Optionally, replace a hand-built `client` with `<LangGraph onRequest={…}>` (see "Changing outgoing requests" in `apps/frontend/README.md`).

**How to check.** Run `moon run client:test -- src/client.test.ts`. In your app, a header your hook sets shows on the `/runs/stream` request in the browser's network panel.

## 2026-11-26 — AI messages render only safe links ([#453](https://github.com/synergyai-nl/svelte-langgraph/pull/453))

**What changed.** `ChatMessage` renders a markdown link in an AI message as a link only when its URL is `http:`, `https:`, `mailto:`, relative or a fragment. Any other scheme, such as `javascript:`, `data:` or `vbscript:`, renders the link's contents without an anchor. Before, links were rendered without a scheme allowlist. The `chat-core` registry item ships the new `ChatMessage.svelte`.

**Who is affected.** Apps that installed the chat item. Apps whose agents link to another scheme on purpose (for example `tel:`) see those links without an anchor.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`).
2. To allow another scheme, add it to `SAFE_LINK_PROTOCOLS` in your copy of `ChatMessage.svelte`.

**How to check.** Run `moon run frontend:test -- src/lib/components/chat/ChatMessage.svelte.test.ts`. In your app, have the agent answer `[x](javascript:alert(1))`: the reply shows `x`, not a link.

## 2026-11-26 — The chat imports the client through `#lib`; drop the `@svelte-langgraph/client` alias ([#452](https://github.com/synergyai-nl/svelte-langgraph/pull/452))

**What changed.** The chat components import the bundled client as `#lib/svelte-langgraph-client/index.ts` instead of by its package name `@svelte-langgraph/client`. The CLI rewrites that import to your `components.json` `lib` alias, like the item's other `#lib` imports, so the chat needs no `alias` in `vite.config.ts` and SvelteKit 3 no longer prints `config_option_deprecated_alias` for it. In this repo a `package.json` `imports` entry, `"#lib/svelte-langgraph-client/index.ts": "@svelte-langgraph/client"`, maps the same specifier to `packages/client`. `chat-core` now also lists `@lucide/svelte` (`>=0.562.0`) and `@types/node` (`*`, a dev dependency), so a fresh app no longer fails on them; a version your `package.json` already declares inside those ranges stays.

**Who is affected.** Apps that installed the chat item. They added an alias for `@svelte-langgraph/client` (install step 2, or step 2 of the 2026-11-19 entry), and the chat no longer needs it.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`).
2. Delete the `'@svelte-langgraph/client': 'src/lib/svelte-langgraph-client'` entry from `alias` in `sveltekit()` in `vite.config.ts`, and the `alias` option if it is now empty.
3. In your own code, replace `from '@svelte-langgraph/client'` with `from '#lib/svelte-langgraph-client/index.ts'` (or your `lib` alias, if you customised it).

**How to check.** `grep -rn "@svelte-langgraph/client" src vite.config.ts` finds nothing, and `svelte-check` and `vite build` pass without a `config_option_deprecated_alias` warning.

## 2026-11-25 — `submit` text is optional; blank text is no longer ignored ([#443](https://github.com/synergyai-nl/svelte-langgraph/pull/443))

**What changed.** `ConversationApi.submit` is now `submit(text?: string)`.

- `submit(text)` sends `text` as a human message, whatever it is. It used to ignore blank or whitespace-only text; it now sends it. It is still a no-op while a run is active.
- `submit()` starts a run with no human message: it submits `{ messages: [] }` on the conversation's stream, for an agent that speaks first or a backend that answers the last human message again after a failed run. It is a no-op while a run is active or the thread history is loading, adds no message to the list and leaves the composer input alone. A failure shows in `api.error` and the error card, as with text.
- The blank check moved to the UI: `MessageComposer` ignores blank input on the send button, Enter and a form submit, and `ChatSurface` ignores a suggestion whose text is blank.

The `chat-core` registry item ships the new `Conversation.svelte`, `MessageComposer.svelte` and `ChatSurface.svelte`.

**Who is affected.** Apps that installed the chat item and call `api.submit` from their own composer, button or snippet. Apps that only use `ChatSurface`, `Conversation`'s default composition or `MessageComposer` need not act.

**What to do.**

1. Update `chat-core` (see "Updating" in `apps/frontend/README.md`).
2. Where your own code calls `api.submit(text)`, return early when `text.trim()` is empty, unless you mean to send blank text.
3. To start a run without a human message, call `api.submit()`.

**How to check.** Run `moon run frontend:test -- src/lib/components/chat/Conversation.svelte.test.ts src/lib/components/chat/MessageComposer.svelte.test.ts`. In your app, press Enter in an empty composer: no request to `/runs/stream` is made.

## 2026-11-19 — Frontend moves to SvelteKit 3 ([#435](https://github.com/synergyai-nl/svelte-langgraph/pull/435))

**What changed.** The frontend runs on SvelteKit 3 (was 2.49), Vite 8, TypeScript 6, adapter-node 6 and Vitest 4 (Vitest 3 does not support Vite 8). It is the output of `sv migrate sveltekit-3` plus follow-ups:

- `$lib/x` imports are now `#lib/x.ts` (package.json `imports`, with explicit file extensions).
- `svelte.config.js` is gone. Its options are passed to `sveltekit({...})` in `vite.config.ts`; the former `kit.*` options are top-level plugin options. `tsconfig.json` extends `$app/tsconfig`.
- `$app/environment` is now `$app/env`. `$env/dynamic/public` and `$env/dynamic/private` are now named imports from `$app/env/public` and `$app/env/private`. The variables are declared in `src/env.ts` with `defineEnvVars` from `@sveltejs/kit/env`. A variable without a `schema` is required and validated at build and start; ours are optional passthrough (`schema: (input) => input`), and the requiredness checks stay in `src/lib/auth/index.ts`.
- Kit 3 calls `handleError` for all errors with `{ event, kind, error }`, where `kind` is `'app'`, `'framework'`, `'validation'` or `'unknown'`. Expected errors such as a 404 are not `unknown`.
- `event.request` is readonly in Kit 3. The Paraglide handle in `src/hooks.server.ts` now passes the middleware's request on a copy of the event: `resolve({ ...event, request }, …)`.
- SvelteKit 3 adds a build-time `paths.origin` option in `sveltekit()`, which adapter-node 6 honours. The `ORIGIN` environment variable still works (checked against adapter-node 6.0.4) but is ignored, with a warning, when `paths.origin` is set. The `sv migrate` checklist says `ORIGIN` was removed; that is not what the released adapter does.
- `@sentry/sveltekit` is 11 (10 only supports Kit 2). v11 filters the Kit 3 `handleError` kinds itself, and `sentrySvelteKit` is imported from `@sentry/sveltekit/vite`. v11 also removed three options we used: `sendDefaultPii` (replaced by `dataCollection`, whose unset default collects user info, cookies and request bodies), `enableLogs` (logs are sent whenever a logging integration is present) and `sourceMapsUploadOptions` in `sentrySvelteKit()` (its fields moved to the top level). `src/lib/sentry.ts` now sets a restrictive `dataCollection` unless `PUBLIC_SENTRY_SEND_PII=true` (or unset in dev), which keeps the previous behaviour.
- Kit 3 deprecates the `alias` option (`config_option_deprecated_alias`, "use subpath imports instead"). It still works. This repo no longer uses it for `async_hooks`.
- The chat registry item (`chat` and `chat-core`) ships Kit 3-style sources (`#lib` imports with file extensions), and its install guide uses `$app/env/public`. Consumers needed an alias for `@svelte-langgraph/client` until the 2026-11-26 entry; in Kit 3 it went in `sveltekit({ alias })` and printed the deprecation warning.

**Who is affected.** Apps that copied the frontend auth helpers, hooks or config, and apps that installed the chat item. The CLI still rewrites the item's imports to the aliases in your `components.json`, but the item is now built and tested on Kit 3 only: move a Kit 2 app to Kit 3 before updating `chat-core`.

**What to do.**

1. Run `npx sv migrate sveltekit-3`.
2. Move `kit.alias` for `@svelte-langgraph/client` into `sveltekit({ alias })` in `vite.config.ts` (removed again by the 2026-11-26 entry).
3. Declare the auth and `PUBLIC_*` variables in `src/env.ts` and import them from `$app/env/private` and `$app/env/public`.
4. Review `handleError`: it now receives all errors. Filter on `kind` and handle only `unknown` (and `app` or `framework` if you need to).
5. Keep `ORIGIN` (or `PROTOCOL_HEADER` and `HOST_HEADER` behind a trusted proxy) as you have it. Only if you set `paths.origin` in `sveltekit()`: drop `ORIGIN`, it is ignored then.
6. Bump `@sentry/sveltekit` to 11 or later and import `sentrySvelteKit` from `@sentry/sveltekit/vite`. Replace `sendDefaultPii` with `dataCollection` in `Sentry.init` (copy `restrictiveDataCollection` from `src/lib/sentry.ts` if you relied on `sendDefaultPii: false`: leaving it unset now sends more data, not less), drop `enableLogs`, and move the fields of `sourceMapsUploadOptions` to the top level of `sentrySvelteKit()`.
7. Bump Vitest to 4 and change `vi.mock` targets from `$app/environment`, `$env/dynamic/public` and `$env/dynamic/private` to `$app/env`, `$app/env/public` and `$app/env/private` (named exports). If you run coverage with `--coverage.include src`, narrow it to code files (`"src/**/*.{ts,js,svelte}"`): Vitest 4 otherwise tries to parse `app.html`.
8. If a `handle` hook assigns to `event.request` (the Paraglide middleware pattern), pass `{ ...event, request }` to `resolve` instead.

**How to check.** Run `moon check frontend` (or your own `svelte-check` and build). Then open an unknown URL: the error page renders and, with Sentry on, the 404 is not reported.

## 2026-11-19 — `/get-access-token` no longer returns `idToken` ([#417](https://github.com/synergyai-nl/svelte-langgraph/pull/417))

**What changed.** Better Auth's `/get-access-token` returned the ID token to the browser, which only needs the access token. An `after` hook in `apps/frontend/src/lib/auth/index.ts` now reduces the response to `accessToken`, `accessTokenExpiresAt` and `scopes`. The hook also applies to `auth.api.getAccessToken(...)` calls on the server. Errors pass through unchanged.

**Who is affected.** Apps that copied `apps/frontend/src/lib/auth/`, and any code that read `idToken` from that response.

**What to do.**

1. Port the `stripIdToken` hook and add it as `hooks.after` next to the existing `before` hook.
2. If your code needs the ID token, read it on the server from the stored account. This response no longer has it, for server calls either.

**How to check.** Request `/api/auth/get-access-token` while signed in. The body has no `idToken`.

## 2026-11-19 — Crons and direct thread-state writes return 403 ([#421](https://github.com/synergyai-nl/svelte-langgraph/pull/421))

**What changed.** Aegra mounts a few routes that run the graph or write its checkpoints without the `threads.create_run` event, so the auth handler can neither validate their run input nor give them the server-set run context. The backend now answers 403, for every caller, on these routes:

- Crons: everything at `/runs/crons` and below, and `/threads/{thread_id}/runs/crons`. Cron runs never pass the run-create event. `CRON_ENABLED=false` only stops the scheduler; the routes stay mounted and the first run still starts.
- Direct thread-state writes: any method other than `GET` and `HEAD` on `/threads/{thread_id}/state`, which includes the SDK's `threads.updateState`. The write skips the graph's own checks (`phase_gate`). Its auth event is `threads.update`, the same as renaming a thread.

A small ASGI middleware (`DenyRoutesMiddleware` in `auth/deny.py`) does this before authentication, so a caller without a token also gets 403, not 401. The body has Aegra's error shape: `{"error": "forbidden", "message": ..., "details": null}`. Aegra's CORS middleware wraps it, so browsers can read the 403. State reads, the history, thread renames (`PATCH /threads/{thread_id}`), the run routes and CORS preflight are unaffected. Thread commands are not denied: since Aegra 0.12 their runs go through `threads.create_run`.

**Who is affected.** Apps that copied this backend's `http.py`, and clients that use crons or `threads.updateState`.

**What to do.**

1. Copy `apps/backend/src/svelte_langgraph/auth/deny.py` into your backend.
2. In your `http.app`, call `app.add_middleware(DenyRoutesMiddleware)` right after creating the `FastAPI` app, as `http.py` does. Do not add it to Aegra's app from outside: it must be added before Aegra adds its own middleware.
3. To keep a route your app really needs, return `False` for it in `is_denied`, at the marked place above the rules. Your app must then guarantee itself what the rule protected:
   - Crons: cron runs get no server-set context and never pass the run-create event. Your graph must not need `runtime.context["user_id"]` for them, and you must validate cron input yourself (the `crons.create` and `crons.update` events in `auth.py` do).
   - Thread-state writes: the written values never pass the graph's checks. Your graph must accept any value the write can store.
4. Copy `tests/test_deny_routes.py` and `tests/aegra_app_probe.py`. On an Aegra upgrade the route-table test fails for every new route until you classify it in `KNOWN_ROUTES`.

**How to check.** Against a running backend, `curl -i -X POST http://localhost:2026/runs/crons` must answer `403` with `"error": "forbidden"`.

## 2026-11-19 — Client run input is validated ([#420](https://github.com/synergyai-nl/svelte-langgraph/pull/420))

**What changed.** Run input from the client reaches the graph's `RunnableConfig`. Before, the backend accepted any `config`, `context` and `checkpoint` keys, and the graph read the user's name from the client's `configurable.user_name`. The auth handler now validates run input when a run, an assistant or a cron is created or updated, and rejects untrusted input with 422. The error names the offending key.

- `config.configurable` may only hold keys in `ALLOWED_CONFIGURABLE_KEYS`, with the listed type. The demo allows only `state_only_submit` (a bool).
- Other `config` keys (`tags`, `metadata`, `recursion_limit`, ...) must be empty or absent.
- `context` must be empty or absent.
- `checkpoint` may only hold `thread_id`, `checkpoint_ns`, `checkpoint_id` and `checkpoint_map`.
- `webhook` must be empty or absent.
- `command` may only carry `resume`; `update` and `goto` are rejected. They let a run write state or start at a node of the caller's choice, past the graph's own checks. A downstream app that needs them must first make sure its graph checks state on every path, and then extend `validate_run_input`.

Runs started through `POST /threads/{id}/commands` pass the same check. There a rejection comes back as an `invalid_argument` command error.

On run create the handler also returns `context: {"user_id": <token subject>}`. Aegra merges it into the run, so the graph has one server-derived key in `runtime.context`. The user's name now comes only from the access token: `get_current_user` sets `display_name` from the `name` claim. The graph reads it from `configurable.langgraph_auth_user`, which Aegra sets on every run. `configurable.user_name` is no longer read. Without a `name` claim, the prompt has no name.

**Who is affected.** Apps that copied this backend's `auth` package or `graph.py`, and clients that send their own `configurable` keys, other `config` keys, a `context`, a `webhook`, or a `command` with `update` or `goto`.

**What to do.**

1. Port `auth/run_input.py`, and the `add_owner` and `get_current_user` changes in `auth/handlers.py`, from `apps/backend/src/svelte_langgraph/`. Skip the `name` claim handling in `get_current_user` if your graph does not use the user's name.
2. Add the `configurable` keys your own client sends to `ALLOWED_CONFIGURABLE_KEYS`, with their type. Never add identity keys such as `user_id` or a user name.
3. In your graph, read identity from `configurable["langgraph_auth_user"]` (port `get_user_name` from `graph.py`) or from `runtime.context["user_id"]`. Never read it from client `configurable` keys. Note that Aegra sets `display_name` to the identity when the token has no name.
4. Update clients that send other `configurable` keys, other `config` keys, a `context`, a `webhook` or a `command` with `update` or `goto`: they now get 422.
5. Assistants already stored in your database are not validated again. Their stored `config` and `context` still reach every run of that assistant. Check stored assistants for identity keys, and delete or update the ones that have them.

**How to check.** Run `moon run backend:test -- tests/test_run_input.py`. Against a running backend, a run create with `config.configurable.user_id` must answer 422 with a detail that names `config.configurable.user_id`.

## 2026-11-19 — JWKS cache expires after five minutes ([#419](https://github.com/synergyai-nl/svelte-langgraph/pull/419))

**What changed.** The backend cached the identity provider's signing keys (JWKS) until the process restarted, so a key the provider removed stayed trusted. The cache now expires after `AUTH_JWKS_TTL_SECONDS` (default `300`, `0` fetches on every request). After expiry the JWKS is fetched again before a token is validated. If that fetch fails, the token is rejected with 401; the expired keys are not used as a fallback. Concurrent requests after expiry share one fetch. An invalid value stops the backend at import.

**Who is affected.** Apps that copied this backend's `auth/oidc.py` or `auth/handlers.py`.

**What to do.**

1. Port the TTL change from `apps/backend/src/svelte_langgraph/auth/oidc.py`: `_read_jwks_ttl`, `jwks_ttl_seconds`, `_jwks_fetched_at`, `_jwks_cache_is_fresh`, `_jwks_lock`, `_fetch_jwks`, the checks in `_get_jwks` and the forced refresh in `_validate_token`. In `auth/handlers.py`, port the `except ValueError` branch that answers 401 when the key is not in the JWKS.
2. Optionally set `AUTH_JWKS_TTL_SECONDS` (and pass it through in your Compose file).
3. Expect the provider's JWKS endpoint to be requested at least once per TTL while there is traffic. Tokens are rejected while it is unreachable after expiry.

**How to check.** Run `moon run backend:test -- tests/test_auth.py`.

## 2026-11-19 — Backend refuses to start without its auth module ([#418](https://github.com/synergyai-nl/svelte-langgraph/pull/418))

**What changed.** Aegra 0.12 stops at startup when `auth.path` fails to load. It still serves every request as `anonymous` when the config has no `auth.path`, and it accepts any `Auth` object `auth.path` names. The demo backend's `http.app` now has a lifespan that checks at startup that Aegra loaded `svelte_langgraph.auth:auth`. If not, the server exits with an error.

**Who is affected.** Apps that copied this backend's `http.py` or run their own `http.app`.

**What to do.**

1. Copy `auth/startup.py` and call `check_auth_loaded` from your `http.app` lifespan (see `apps/backend/src/svelte_langgraph/http.py`). Change its import of `auth` to your own auth object.
2. Pass `lifespan=lifespan` when you create the `FastAPI` app. An `on_startup` handler does not work here: Aegra rejects them.
3. Keep `AUTH_TYPE=custom` set. Aegra 0.12 and earlier enforce nothing based on it. Once [aegra/aegra#775](https://github.com/aegra/aegra/pull/775) ships, it is what makes Aegra refuse to start without `auth.path`.

**How to check.** Remove the `auth` block in a copy of `aegra.json` and start the backend with `AEGRA_CONFIG` pointing at the copy. The process must exit with "Aegra did not load svelte_langgraph.auth:auth". A wrong `auth.path` makes Aegra itself exit with `AuthLoadError`.

## 2026-11-19 — Backend auth code moves into a package ([#424](https://github.com/synergyai-nl/svelte-langgraph/pull/424))

**What changed.** `apps/backend/src/svelte_langgraph/auth.py` became the package `svelte_langgraph/auth/`. Token validation and the JWKS cache are in `auth/oidc.py`. The `Auth` object and its handlers are in `auth/handlers.py`. No behaviour changed.

**Who is affected.** Apps that track this repo's `auth.py`.

**What to do.**

1. Nothing at runtime. `auth.path` in `aegra.json` stays `svelte_langgraph.auth:auth`. Keep it a module path, not a file path.
2. When you port later changes to the auth code, look in the new files.

**How to check.** In the backend directory, run `uv run python -c "from svelte_langgraph.auth import auth; print(auth)"`. It prints an `Auth` object.

## 2026-11-19 — Backend moves to Aegra 0.12.0 ([#416](https://github.com/synergyai-nl/svelte-langgraph/pull/416))

**What changed.** The demo backend now pins `aegra-api==0.12.*` (it was `0.10.*`). It turns off run webhooks in `aegra.json`. It drops `pin_trace_to_run`, because Aegra now sets the trace id itself. Later entries on this page add the guards that reject anonymous callers.

These facts matter for any downstream app:

- Since 0.12, Aegra refuses to start when `auth.path` fails to load ([GHSA-9m3w-47v5-v54c](https://github.com/aegra/aegra/security/advisories/GHSA-9m3w-47v5-v54c)).
- With no `auth.path` (no `auth` block, or `AEGRA_CONFIG` at a file without one), Aegra still serves every request as the user `anonymous`, with `is_authenticated: False`. That flag rejects nothing by itself.
- The `AUTH_TYPE` environment variable enforces nothing, in 0.10 through 0.12.
- Aegra 0.12 calls a `webhook` URL that a client puts on a run or cron. This backend sets `http.disable_webhooks: true`, so such a request gets 422.
- Aegra 0.12 sets each run's trace id from its run id (`OTEL_TRACE_ID_FROM_RUN_ID`, on by default; off under a ratio sampler). `/feedback` relies on it.
- Thread commands now pass the run-create auth check ([GHSA-w5hm-3qhp-8mqp](https://github.com/aegra/aegra/security/advisories/GHSA-w5hm-3qhp-8mqp)).
- The lock moves to `langgraph>=1.2.16` and `langgraph-checkpoint-postgres>=3.2.0`.

One API change is visible to clients: `POST /threads/search` answers 422 when `select` is set. The client in this repo retries without `select`. A client of your own must do the same, or not send `select`.

**Who is affected.** Apps that copied this backend's `pyproject.toml`, `aegra.json` or `tracing.py`, or run their own Aegra server.

**What to do.**

1. In `apps/backend/pyproject.toml` (or your own `pyproject.toml`), change the pin to `aegra-api==0.12.*`.
2. Refresh the lockfile: run `uv lock --upgrade-package aegra-api` in the backend directory.
3. In `aegra.json`, add `"disable_webhooks": true` under `http`. If you need webhooks, add a `webhooks` block that allows only your own hosts instead.
4. Delete `pin_trace_to_run` and its call in `graph.py`. Keep `OTEL_TRACE_ID_FROM_RUN_ID` on.
5. Rebuild and redeploy the backend image.
6. Do not rely on `AUTH_TYPE` or `is_authenticated` to keep anonymous callers out.

**How to check.** In the backend directory, run `uv pip show aegra-api`. It must report `Version: 0.12.0` or a later 0.12 release.
