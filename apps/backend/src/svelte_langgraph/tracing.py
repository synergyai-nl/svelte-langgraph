"""Trace identity and user-feedback scoring.

Aegra owns tracing itself: `OTEL_TARGETS=LANGFUSE` makes it export every run
over OTLP and stamp each span with `langfuse.trace.metadata.run_id` (see
`aegra_api.observability.span_enrichment`). This module adds the two things it
has no opinion about — which id that trace gets, and how a rating is attached
to it.

Those two are the same problem. Left alone, OpenTelemetry mints a random trace
id, so scoring a run would mean searching Langfuse for the trace carrying its
`run_id` — a search that returns nothing for the first ~10s while the trace is
being ingested, which is exactly when people rate an answer. Choosing the trace
id up front removes the search: `pin_trace_to_run` makes it equal to the run id,
and `record_score` can then post straight to it.
"""

import asyncio
import logging
import os
from typing import Literal
from uuid import UUID

import httpx
from langchain_core.runnables import RunnableConfig
from opentelemetry import context as otel_context
from opentelemetry.trace import (
    NonRecordingSpan,
    SpanContext,
    TraceFlags,
    set_span_in_context,
)

logger = logging.getLogger(__name__)

Rating = Literal["up", "down"]

# Same variable Aegra's LangfuseTarget reads, so tracing and scoring are
# configured once rather than twice.
_DEFAULT_BASE_URL = "http://localhost:3000"

# Langfuse's own latency runs to several seconds under normal load, so httpx's
# default would give up well before it.
_TIMEOUT = httpx.Timeout(30.0)

# Pinning removed the *ingestion* race, not ordinary flakiness: a 5xx, a DNS
# blip or a restarting self-hosted instance would otherwise lose the rating
# outright, since the caller has nowhere to put it. Short and bounded, because
# /feedback is awaited and a click must not hang.
_RETRY_DELAYS = (0.5, 2.0)


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
    """The trace id `pin_trace_to_run` gives a run, or None if it can't have one.

    A run id is a UUID and an OTEL trace id is 16 bytes, so one is just the
    other's hex. Both sides compute this independently — nothing is stored.
    """
    try:
        return UUID(str(run_id)).hex
    except (ValueError, AttributeError, TypeError):
        return None


def pin_trace_to_run(config: RunnableConfig) -> None:
    """Make the run's exported trace id equal to its run id.

    Attaches a non-recording parent span carrying the wanted id. Everything the
    run then traces inherits it, because OpenInference's LangChain tracer starts
    its root span from the ambient context (it leaves
    `separate_trace_from_runtime_context` off, so the parent context is `None`,
    meaning "use whatever is current").

    The timing is what makes this work, and it is Aegra's doing: a graph factory
    taking `config` is invoked per run, inside the run's own task, with
    `configurable.run_id` already set and before `astream` opens any span.

    Nothing detaches this. It doesn't leak, because every run gets its own
    `contextvars.Context` — explicitly in `LocalExecutor.submit`, and via
    `asyncio.create_task` in the worker — which dies with the run.
    """
    run_id = (config.get("configurable") or {}).get("run_id")
    if not run_id:
        # Aegra also calls the factory with defaults to extract the state schema
        # at startup, and main.py's CLI loop has no server-issued run id.
        return

    trace_id = trace_id_for_run(run_id)
    if trace_id is None:
        logger.warning("run_id %r is not a UUID; leaving the trace id random", run_id)
        return

    uid = UUID(str(run_id))
    span_context = SpanContext(
        trace_id=uid.int,
        # Any non-zero span id works — this parent is never exported, it only
        # carries the trace id. Deriving it from the run keeps it deterministic.
        span_id=(uid.int >> 64) or 1,
        is_remote=True,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )
    otel_context.attach(set_span_in_context(NonRecordingSpan(span_context)))


async def record_score(
    run_id: str,
    score: Rating,
    name: str = "user_feedback",
    comment: str | None = None,
) -> bool:
    """Attach `score` to the Langfuse trace produced by `run_id`.

    No lookup and no waiting for ingestion: the trace id is derived from the run
    id, and Langfuse keeps a score whose trace hasn't landed yet, joining the two
    on `traceId` once it does (verified against cloud.langfuse.com). So this is a
    single POST, briefly retried on transport or 5xx failures, that can be
    awaited inside the request that triggered it.
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
        # counted. This is also why the comment below is always sent.
        "id": f"{trace_id}-{name}",
        "traceId": trace_id,
        "name": name,
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
                # 4xx means this request is wrong and will stay wrong; only a
                # server-side or transport failure is worth repeating.
                if exc.response.status_code < 500:
                    logger.error(
                        "Langfuse rejected the score for run %s: %s %s",
                        run_id,
                        exc.response.status_code,
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
