# Upgrade notes for downstream apps

This page is for two kinds of readers:

- Apps that copied or ported this backend: `auth.py`, `http.py`, `graph.py`, the Dockerfile or `aegra.json`. This includes the frontend auth helpers.
- Apps that installed the chat item from the registry.

There are no version numbers, because the code is distributed off `main`. Entries are keyed by date and PR number, newest first.

Each entry has this format:

- Heading: `## YYYY-MM-DD — <title that says what changed> (#PR)`
- **What changed**: one or two sentences.
- **Who is affected**: which downstream apps need to act.
- **What to do**: numbered steps.
- **How to check**: one command or request.

## 2026-11-16 — Backend moves to Aegra 0.11.0 (#PR-A)

**What changed.** The demo backend now pins `aegra-api==0.11.*` (it was `0.10.*`). Later entries on this page add the actual authentication guard.

Two facts matter for any downstream app:

- In 0.11, a request without valid credentials, on a server whose auth module did not load, is still served. Aegra treats it as the user `anonymous`, with `is_authenticated: False`. That flag does not reject anything by itself.
- The `AUTH_TYPE` environment variable does not enforce authentication in Aegra, in 0.10 or in 0.11. With a missing auth module, `custom` behaves like `noop`.

**Who is affected.** Apps that copied this backend's `pyproject.toml` or run their own Aegra server.

**What to do.**

1. In `apps/backend/pyproject.toml` (or your own `pyproject.toml`), change `aegra-api==0.10.*` to `aegra-api==0.11.*`.
2. Refresh the lockfile: run `uv lock` in the backend directory.
3. Rebuild and redeploy the backend image.
4. Do not rely on `AUTH_TYPE` or `is_authenticated` to keep anonymous callers out.

**How to check.** In the backend directory, run `uv pip show aegra-api`. It must report `Version: 0.11.0` or a later 0.11 release.
