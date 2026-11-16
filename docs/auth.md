# Backend trust model

This page is for people who port this backend. It says what the backend trusts, what it enforces, and what it leaves open. For the change history, see [upgrading.md](upgrading.md).

The backend is [Aegra](https://docs.aegra.dev) plus this repo's auth module, route deny list and startup check, all in `apps/backend/src/svelte_langgraph/`.

## What Aegra trusts

Aegra takes these from the client as given, unless your app says otherwise:

- Run input: `config`, `context` and `checkpoint`. They reach the graph's `RunnableConfig`.
- An assistant's `config` and `context`. They reach every run of that assistant.
- Cron payloads.
- Run `metadata`.
- The `AUTH_TYPE` setting. It does not enforce anything.
- A missing auth module. If Aegra cannot load it, it logs a warning and serves every request as the user `anonymous`.

## What this backend enforces

| Guard | Where | What it guarantees |
| --- | --- | --- |
| Token validation | `auth.py`, `get_current_user` | A request needs a bearer token with a valid RS256, RS384 or RS512 signature, an `exp`, a `sub`, the audience `AUTH_OIDC_AUDIENCE` and the issuer `AUTH_OIDC_ISSUER`. The signing keys (JWKS) are fetched again after `AUTH_JWKS_TTL_SECONDS` (default 300). If that fetch fails, the token is rejected. |
| Ownership filter | `auth.py`, `add_owner` | New resources get `owner` metadata. Every access is filtered by it. Aegra applies the filter. |
| Run input validation | `auth.py`, `validate_run_input` | On run create, assistant create and update, and cron create and update, a client may only send the `configurable` keys in `ALLOWED_CONFIGURABLE_KEYS`. Other `config` keys and `context` must be empty. `checkpoint` may only address a checkpoint. Anything else gets 422, and the message names the key. |
| Server-set identity | `auth.py`, `add_owner` and `get_current_user`; `graph.py`, `get_user_name` | On run create the handler sets `context.user_id` from the token. The user's name comes from the `name` claim, through `configurable.langgraph_auth_user`. The graph never reads identity from client input. |
| Route deny list | `deny.py`, `is_denied` and `DenyRoutesMiddleware` | Every caller gets 403 on the cron routes, on writes to `/threads/{id}/state` and on `/threads/{id}/commands`. These routes would run the graph or write checkpoints without the checks above. |
| Startup check | `http.py`, `check_auth_loaded` | The server does not start unless Aegra loaded `svelte_langgraph.auth.auth`. |

The E2E tests in `e2e/src/backend-integration.spec.ts` check these guards against a running backend, with two users.

## What stays open

- **Stored assistants.** Assistants already in a database are not validated again. Their stored `config` and `context` reach every run of that assistant.
- **Run `metadata`.** It is not validated. It plays no part in ownership. It appears as tracing metadata attributes, while the tracing user and session fields are set by the server.
- **The store routes.** They stay open. Aegra scopes items per user, under the namespace prefix `["users", <identity>]`. The demo graph does not read the store. A graph that does read it reads values the client wrote. The ownership filter is also applied to store search, so a search only returns items whose value has a matching `owner` field.
- **Two thread routes.** `POST /threads/{id}/stream/events` (a read-only stream) and `POST /threads/prune` stay open.
- **Names equal to the identity.** A user whose `name` claim equals their `sub` is not addressed by name. Aegra fills the name with the identity when the token has none, so the two cannot be told apart.
- **Ownership itself.** Who may read, patch or delete a thread, run or assistant is Aegra's `user_id` and `owner` filtering, driven by the filter that `add_owner` returns. This backend relies on it and does not check it again.

## What your app must add

- Add the `configurable` keys your own client sends to `ALLOWED_CONFIGURABLE_KEYS`, with their type. Never add identity keys.
- Read identity from `configurable["langgraph_auth_user"]` or `context["user_id"]`. Never read it from client `configurable` keys.
- Keep the startup check, and import your own auth object in it.
- Keep the route deny list, or take over its guarantees for every route you allow.
- Check stored assistants for identity keys, and delete or update the ones that have them.
- On every Aegra upgrade, classify each new route. The route-table test (`tests/test_deny_routes.py`) fails until you do.
- If you ever add cookies, pin `http.cors.allow_origins` to your origins. The demo serves wildcard CORS because it only accepts a bearer header.
