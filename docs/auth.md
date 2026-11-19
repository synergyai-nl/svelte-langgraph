# Backend trust model

This page is for people who port this backend. It says what the backend trusts, what it enforces, and what it leaves open. For the change history, see [upgrading.md](upgrading.md).

The backend is [Aegra](https://docs.aegra.dev) plus this repo's guards. They live in `apps/backend/src/svelte_langgraph/auth/`. `http.py` runs the startup check and registers the deny middleware.

## What Aegra trusts

Aegra takes these from the client as given, unless your app says otherwise:

- Run input: `config`, `context` and `checkpoint`. They reach the graph's `RunnableConfig`.
- An assistant's `config` and `context`. They reach every run of that assistant.
- Cron payloads.
- Run `metadata`.
- A run's or cron's `webhook` URL. Aegra 0.12 calls it.
- The `AUTH_TYPE` setting. It does not enforce anything.
- A config without `auth.path`: Aegra serves every request as `anonymous`. (A failing `auth.path` stops startup since 0.12.)
- `is_authenticated`: false for `anonymous`, but `require_auth` does not check it.
- Another `Auth` object named by `auth.path`. Aegra accepts it.

## What this backend enforces

| Guard | Where | What it guarantees |
| --- | --- | --- |
| Token validation | `auth/oidc.py`, and `get_current_user` in `auth/handlers.py` | A request needs a bearer token with a valid RS256, RS384 or RS512 signature, an `exp`, a `sub`, the audience `AUTH_OIDC_AUDIENCE` and the issuer `AUTH_OIDC_ISSUER`. The signing keys (JWKS) are fetched again after `AUTH_JWKS_TTL_SECONDS` (default 300). If that fetch fails, the token is rejected. |
| Ownership filter | `auth/handlers.py`, `add_owner` | New resources get `owner` metadata. Every access is filtered by it. Aegra applies the filter. |
| Run input validation | `auth/run_input.py`, `validate_run_input` | On run create, assistant create and update, and cron create and update, a client may only send the `configurable` keys in `ALLOWED_CONFIGURABLE_KEYS`. Other `config` keys and `context` must be empty. `checkpoint` may only address a checkpoint. `webhook` must be empty. `command` may only carry `resume`. This covers runs started through `/commands`. Anything else gets 422, and the message names the key. |
| Server-set identity | `auth/handlers.py`, `add_owner` and `get_current_user`; `graph.py`, `get_user_name` | On run create the handler sets `context.user_id` from the token. The user's name comes from the `name` claim, through `configurable.langgraph_auth_user`. The graph never reads identity from client input. |
| Route deny list | `auth/deny.py`, `is_denied` and `DenyRoutesMiddleware` | Every caller gets 403 on the cron routes and on writes to `/threads/{id}/state`. These routes would run the graph or write checkpoints without the checks above. |
| Startup check | `auth/startup.py`, `check_auth_loaded` | The server does not start unless Aegra loaded `svelte_langgraph.auth:auth`. Aegra 0.12 stops on a failing `auth.path`; this also covers a missing `auth.path` and a foreign `Auth` object. |
| Webhooks off | `aegra.json`, `http.disable_webhooks` | A run with `webhook` gets 422. |

The E2E tests in `e2e/src/backend-integration.spec.ts` check these guards against a running backend, with two users.

## What stays open

- **Stored assistants.** Assistants already in a database are not validated again. Their stored `config` and `context` reach every run of that assistant.
- **Run `metadata`.** It is not validated. It plays no part in ownership. It appears as tracing metadata attributes, while the tracing user and session fields are set by the server.
- **The store routes.** They stay open. Aegra scopes items per user, under the namespace prefix `["users", <identity>]`. The demo graph does not read the store. A graph that does read it reads values the client wrote. The ownership filter is also applied to store search, so a search only returns items whose value has a matching `owner` field.
- **Two thread routes.** `POST /threads/{id}/stream/events` (a read-only stream) and `POST /threads/prune` stay open. `POST /threads/prune` only acts on the caller's own threads (Aegra 0.12), so it is not denied.
- **Names equal to the identity.** A user whose `name` claim equals their `sub` is not addressed by name. Aegra fills the name with the identity when the token has none, so the two cannot be told apart.
- **Ownership itself.** Who may read, patch or delete a thread, run or assistant is Aegra's `user_id` and `owner` filtering, driven by the filter that `add_owner` returns. This backend relies on it and does not check it again.

## What your app must add

- Add the `configurable` keys your own client sends to `ALLOWED_CONFIGURABLE_KEYS`, with their type. Never add identity keys.
- Read identity from `configurable["langgraph_auth_user"]` or `context["user_id"]`. Never read it from client `configurable` keys.
- Keep the startup check, and import your own auth object in it.
- Keep `http.disable_webhooks: true` in `aegra.json`, or allow only your own hosts in a `webhooks` block.
- Keep the route deny list, or take over its guarantees for every route you allow.
- Check stored assistants for identity keys, and delete or update the ones that have them.
- On every Aegra upgrade, classify each new route. The route-table test (`tests/test_deny_routes.py`) fails until you do.
- If you ever add cookies, pin `http.cors.allow_origins` to your origins. The demo serves wildcard CORS because it only accepts a bearer header.
