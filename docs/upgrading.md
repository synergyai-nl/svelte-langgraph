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

## 2026-11-19 — JWKS cache expires after five minutes ([#419](https://github.com/synergyai-nl/svelte-langgraph/pull/419))

**What changed.** The backend cached the identity provider's signing keys (JWKS) until the process restarted, so a key the provider removed stayed trusted. The cache now expires after `AUTH_JWKS_TTL_SECONDS` (default `300`, `0` fetches on every request). After expiry the JWKS is fetched again before a token is validated. If that fetch fails, the token is rejected with 401; the expired keys are not used as a fallback. An invalid value stops the backend at import.

**Who is affected.** Apps that copied this backend's `auth/oidc.py`.

**What to do.**

1. Port the TTL change from `apps/backend/src/svelte_langgraph/auth/oidc.py`: `_read_jwks_ttl`, `jwks_ttl_seconds`, `_jwks_fetched_at`, `_jwks_cache_is_fresh` and the check in `_get_jwks`.
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
