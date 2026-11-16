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

## 2026-11-19 — Client run input is validated ([#420](https://github.com/synergyai-nl/svelte-langgraph/pull/420))

**What changed.** Run input from the client reaches the graph's `RunnableConfig`. Before, the backend accepted any `config`, `context` and `checkpoint` keys, and the graph read the user's name from the client's `configurable.user_name`. The auth handler now validates run input when a run, an assistant or a cron is created or updated, and rejects untrusted input with 422. The error names the offending key.

- `config.configurable` may only hold keys in `ALLOWED_CONFIGURABLE_KEYS`, with the listed type. The demo allows only `state_only_submit` (a bool).
- Other `config` keys (`tags`, `metadata`, `recursion_limit`, ...) must be empty or absent.
- `context` must be empty or absent.
- `checkpoint` may only hold `thread_id`, `checkpoint_ns`, `checkpoint_id` and `checkpoint_map`.

On run create the handler also returns `context: {"user_id": <token subject>}`. Aegra merges it into the run, so the graph has one server-derived key in `runtime.context`. The user's name now comes only from the access token: `get_current_user` sets `display_name` from the `name` claim. The graph reads it from `configurable.langgraph_auth_user`, which Aegra sets on every run. `configurable.user_name` is no longer read. Without a `name` claim, the prompt has no name.

**Who is affected.** Apps that copied this backend's `auth.py` or `graph.py`, and clients that send their own `configurable` keys, a `context` or other `config` keys.

**What to do.**

1. Port `ALLOWED_CONFIGURABLE_KEYS`, `ALLOWED_CHECKPOINT_KEYS`, `RUN_INPUT_EVENTS`, `validate_run_input` and its helpers, and the changes in `add_owner` from `apps/backend/src/svelte_langgraph/auth.py`.
2. Add the `configurable` keys your own client sends to `ALLOWED_CONFIGURABLE_KEYS`, with their type. Never add identity keys such as `user_id` or a user name.
3. In your graph, read identity from `configurable["langgraph_auth_user"]` (port `get_user_name` from `graph.py`) or from `runtime.context["user_id"]`. Never read it from client `configurable` keys. Note that Aegra sets `display_name` to the identity when the token has no name.
4. Port the `name` claim handling in `get_current_user` if your graph uses the user's name.
5. Update clients that send other `configurable` keys, other `config` keys or a `context`: they now get 422.
6. Assistants already stored in your database are not validated again. Their stored `config` and `context` still reach every run of that assistant. Check stored assistants for identity keys, and delete or update the ones that have them.

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
3. Stop relying on `AUTH_TYPE=custom`. You may keep the variable, but Aegra does not enforce anything based on it.

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
