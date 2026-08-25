"""User-feedback scoring against the traces Aegra exports.

Tracing itself is not implemented here. Aegra owns it: setting
``OTEL_TARGETS=LANGFUSE`` makes it export every run to Langfuse over OTLP and
stamp each span with ``langfuse.trace.metadata.run_id`` (see
``aegra_api.observability.span_enrichment``). This module only does the one
thing Aegra has no endpoint for — attaching a score to the trace a run
produced.

Because the trace id is now a random OTEL id rather than the run id, scoring
is a two-step operation: look the trace up by its ``run_id`` metadata, then
post the score. The lookup is the awkward part — Langfuse takes roughly ten
seconds to make a freshly exported trace queryable, and people rate a reply
within a second or two of reading it. So :func:`record_score` retries the
lookup on a backoff and is meant to be awaited in the background rather than
inside the request/response cycle.
"""

import asyncio
import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# Same variables Aegra's LangfuseTarget reads, so tracing and scoring are
# configured once rather than twice.
_DEFAULT_BASE_URL = "http://localhost:3000"

# Langfuse only makes an exported trace queryable after it has been ingested,
# which took ~10s when measured against cloud.langfuse.com. These delays give
# the lookup a little over two minutes to find it, front-loaded so the common
# case (a rating on an older message, already ingested) still resolves on the
# first attempt.
_RETRY_DELAYS = (0.0, 2.0, 4.0, 8.0, 15.0, 30.0, 60.0)

# Langfuse's own list latency is several seconds under normal conditions, so
# the client default is too tight to be reliable here.
_TIMEOUT = httpx.Timeout(30.0)


def is_configured() -> bool:
    """Langfuse credentials are optional (see .env.example) — without them
    scoring no-ops rather than raising at run time."""
    return bool(os.environ.get("LANGFUSE_PUBLIC_KEY")) and bool(
        os.environ.get("LANGFUSE_SECRET_KEY")
    )


def _base_url() -> str:
    return (os.environ.get("LANGFUSE_BASE_URL") or _DEFAULT_BASE_URL).rstrip("/")


def _auth() -> tuple[str, str]:
    return (
        os.environ.get("LANGFUSE_PUBLIC_KEY", ""),
        os.environ.get("LANGFUSE_SECRET_KEY", ""),
    )


async def _find_trace_id(client: httpx.AsyncClient, run_id: str) -> str | None:
    """Return the id of the trace Aegra exported for `run_id`, if it has landed.

    `run_id` is matched against the trace metadata Aegra stamps on every span.
    A `stringObject` filter targets a single key inside the metadata blob,
    which is what makes this an indexed lookup rather than a scan.
    """
    filter_spec = json.dumps(
        [
            {
                "type": "stringObject",
                "column": "metadata",
                "key": "run_id",
                "operator": "=",
                "value": run_id,
            }
        ]
    )
    response = await client.get(
        f"{_base_url()}/api/public/traces",
        params={"filter": filter_spec, "limit": 1},
        auth=_auth(),
    )
    response.raise_for_status()
    data = response.json().get("data") or []
    return data[0]["id"] if data else None


async def _post_score(
    client: httpx.AsyncClient, trace_id: str, score: float, name: str
) -> None:
    response = await client.post(
        f"{_base_url()}/api/public/scores",
        json={"traceId": trace_id, "name": name, "value": score},
        auth=_auth(),
    )
    response.raise_for_status()


async def record_score(run_id: str, score: float, name: str = "user_feedback") -> bool:
    """Attach `score` to the Langfuse trace produced by `run_id`.

    Returns True once the score is accepted. Returns False if Langfuse is not
    configured, or if the trace never became queryable within the retry window
    — a rating that arrives before its trace has been ingested is retried, not
    dropped, but a run that was never exported at all cannot be scored.

    Intended to be awaited outside the request/response cycle: a single call
    can spend the whole retry window waiting on ingestion.
    """
    if not run_id or not is_configured():
        return False

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            for delay in _RETRY_DELAYS:
                if delay:
                    await asyncio.sleep(delay)
                trace_id = await _find_trace_id(client, run_id)
                if trace_id is None:
                    continue
                await _post_score(client, trace_id, score, name)
                return True
    except Exception:
        logger.exception("Failed to record score for run %s", run_id)
        return False

    logger.warning(
        "No Langfuse trace found for run %s after %.0fs; score dropped",
        run_id,
        sum(_RETRY_DELAYS),
    )
    return False
