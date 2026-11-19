"""Trace identity and user-feedback scoring.

Aegra owns tracing itself: `OTEL_TARGETS=LANGFUSE` makes it export every run
over OTLP and stamp each span with `langfuse.trace.metadata.run_id` (see
`aegra_api.observability.span_enrichment`). This module attaches a rating to
that trace.

Aegra sets each run's trace id from its run id (`OTEL_TRACE_ID_FROM_RUN_ID`,
on by default). So `record_score` computes the trace id from the run id and
posts straight to it. Without that, scoring a run would mean searching
Langfuse for the trace carrying its `run_id`, and that search returns nothing
for the first ~10s while the trace is ingested, which is when people rate an
answer. A ratio sampler (`traceidratio` or `parentbased_traceidratio`) turns
the setting off, and scores then attach to no trace.
"""

import asyncio
import logging
import os
from typing import Literal
from uuid import UUID

import httpx

logger = logging.getLogger(__name__)

Rating = Literal["up", "down"]

# Same variable Aegra's LangfuseTarget reads, so tracing and scoring are
# configured once rather than twice.
_DEFAULT_BASE_URL = "http://localhost:3000"

_SCORE_NAME = "user_feedback"

# Langfuse's own latency runs to several seconds under normal load, so httpx's
# default would give up well before it.
_TIMEOUT = httpx.Timeout(30.0)

# A known trace id removes the *ingestion* race, not ordinary flakiness: a 5xx,
# a DNS blip or a restarting self-hosted instance would otherwise lose the
# rating outright, since the caller has nowhere to put it.
_RETRY_DELAYS = (0.5, 2.0)
_RETRYABLE_STATUSES = {408, 429}

# One bound on the whole call, retries included, because /feedback awaits it.
# The frontend's request timeout sits above this, so the 502 arrives first.
_DEADLINE_SECONDS = 10.0


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


def trace_id_for_run(run_id: str) -> str | None:
    """The trace id Aegra gives a run, or None if it can't have one.

    A run id is a UUID and an OTEL trace id is 16 bytes, so one is just the
    other's hex. Aegra seeds the trace id with `UUID(run_id).int` while
    `OTEL_TRACE_ID_FROM_RUN_ID` is on; `record_score` relies on that. Both
    sides compute it independently, so nothing is stored.
    """
    try:
        return UUID(str(run_id)).hex
    except (ValueError, AttributeError, TypeError):
        return None


async def record_score(
    run_id: str,
    score: Rating,
    score_id: str,
    comment: str | None = None,
) -> bool:
    """Attach `score` to the Langfuse trace produced by `run_id`.

    No lookup and no waiting for ingestion: the trace id is derived from the run
    id, and Langfuse keeps a score whose trace hasn't landed yet, joining the two
    on `traceId` once it does (verified against cloud.langfuse.com). So this is a
    single POST, retried on transient failures within one deadline, that can
    be awaited inside the request that triggered it.
    """
    if not run_id or not is_configured():
        return False

    trace_id = trace_id_for_run(run_id)
    if trace_id is None:
        logger.warning("run_id %r is not a UUID; cannot score its trace", run_id)
        return False

    payload: dict[str, object] = {
        # Deterministic, so this is an upsert: Langfuse updates a score when the
        # id already exists. Without it a changed mind (rate up, then down)
        # leaves two scores on the same trace, contradicting each other and both
        # counted. This is also why the comment below is always sent. /feedback
        # passes a per-user, per-message id: one run can produce several answers.
        "id": score_id,
        "traceId": trace_id,
        "name": _SCORE_NAME,
        # Categorical values travel in `value`; there is no `stringValue` on
        # the request, and without `dataType` the label is read as a numeric.
        # Adding a `configId` here would also map the categories to numbers,
        # which is what dashboards need to show a rate rather than counts.
        "value": score,
        "dataType": "CATEGORICAL",
        # Always sent, blank when there is none, because the id above makes this
        # an upsert. Omitting the key would leave the comment from a previous
        # rating attached to the new one -- rate down with "hallucinated the
        # API", change to up, and the positive score would still carry it. A
        # blank string overwrites under either merge or replace semantics, where
        # null would depend on the field accepting it.
        "comment": (comment or "").strip(),
    }
    url = f"{_base_url()}/api/public/scores"
    try:
        async with asyncio.timeout(_DEADLINE_SECONDS):
            return await _post_with_retries(url, payload, run_id)
    except TimeoutError:
        logger.error(
            "Giving up on the score for run %s after %ss", run_id, _DEADLINE_SECONDS
        )
        return False


async def _post_with_retries(url: str, payload: dict[str, object], run_id: str) -> bool:
    last_error: Exception | None = None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for attempt, delay in enumerate((0.0, *_RETRY_DELAYS)):
            if delay:
                await asyncio.sleep(delay)
            try:
                response = await client.post(url, json=payload, auth=_auth())
                response.raise_for_status()
                return True
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status < 500 and status not in _RETRYABLE_STATUSES:
                    logger.error(
                        "Langfuse rejected the score for run %s: %s %s",
                        run_id,
                        status,
                        exc.response.text[:200],
                    )
                    return False
                last_error = exc
            except Exception as exc:  # noqa: BLE001 - retried below, logged at the end
                last_error = exc

            logger.warning(
                "Scoring run %s failed (attempt %d/%d): %s",
                run_id,
                attempt + 1,
                len(_RETRY_DELAYS) + 1,
                last_error,
            )

    logger.error("Giving up on the score for run %s: %s", run_id, last_error)
    return False
