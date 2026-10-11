# langgraph

> **Monorepo note:** For the full local stack (frontend, backend, and OIDC mock), run `moon :dev :oidc-mock` from the [repo root](../../README.md). To run only the OIDC mock provider: `moon backend:oidc-mock`.

Langgraph server project.

## Getting started
### Requirements
* Python 3.12
* [uv](https://docs.astral.sh/uv/)
* Proto + moon (see root README for setup)

### Install deps

Dependencies are installed automatically by moon tasks. From the repo root:

```bash
proto install
moon setup   # first time only, if needed
```

### Development

Start frontend and backend (without OIDC mock):

```sh
moon :dev
```

For local auth testing, start the full stack including the OIDC mock provider:

```sh
moon :dev :oidc-mock
```

Or run the OIDC mock in a separate terminal:

```sh
moon backend:oidc-mock
```

### CLI
For testing.

Run in command-line:
```sh
src/svelte_langgraph/main.py 
```

Example:
```
drbob@stingray backend % src/svelte_langgraph/main.py
Hi, how are you doing?
Very well, thank you!
I'm glad to hear you're doing well! How can I assist you today?
What's the weather in Paredes de Coura?
I'll check the weather in Paredes de Coura for you. It's always sunny in Paredes de Coura! According to the weather information, it's always sunny in Paredes de Coura! That sounds like lovely weather conditions there.
[Press Ctrl+D (on Unix/macOS) or Ctrl+Z then Enter (on Windows) to exit]
```

## Feedback architecture and upstream migration

Thumbs up/down on an AI answer is one `POST /feedback` (`svelte_langgraph.feedback`), fire-and-forget: success is acknowledged in the UI, a reload forgets it, and nothing is read back. Ratings are stored only as Langfuse scores.

- **Authorization.** The route requires auth itself (`Depends(require_auth)`), because `enable_custom_route_auth` in `aegra.json` does not enforce it. It then calls Aegra's public API in-process with the caller's token: GET thread first (that call applies the auth handler's filters), then GET state to find the message. Another user's thread returns 404. The feedback module owns validation and the score; Aegra owns access.
- **Run lookup.** `RunStampMiddleware` (`feedback/provenance.py`) stamps each AI message with the run that produced it, so feedback never searches checkpoints. Messages created before that stamp existed return 404 instead of being guessed at.
- **Score identity.** One score per user per message (`score_id`), so resubmitting updates the earlier score.
- **Configuration.** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and optionally `LANGFUSE_BASE_URL`, with `OTEL_TARGETS=LANGFUSE`. Without the keys, feedback is accepted and not recorded.
- **Tracing shim.** `pin_trace_to_run` (`tracing.py`) sets the trace id to the run id, so a score can be posted directly to the trace. It is a stand-in for [aegra/aegra#372](https://github.com/aegra/aegra/pull/372). When a release ships #372, delete the marked call in `graph.py` (never run both mechanisms), then confirm in a real Langfuse export that the trace id still equals `UUID(run_id).hex` with a parentless root span, in both local and worker run modes.
- **Upstream.** Once Aegra supports native feedback ([aegra/aegra#402](https://github.com/aegra/aegra/issues/402)), this route can move onto it. Langfuse-specific calls stay inside the feedback module until then; there is no generic provider layer.
