import logging
import os
from typing import Any

from langfuse import get_client
from langfuse.langchain import CallbackHandler

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """Langfuse credentials are optional (see .env.example) — without them
    tracing and scoring both no-op rather than raising at run time."""
    return bool(os.environ.get("LANGFUSE_PUBLIC_KEY")) and bool(
        os.environ.get("LANGFUSE_SECRET_KEY")
    )


def _to_langfuse_trace_id(run_id: str) -> str:
    """Convert a LangGraph run_id (UUIDv7) to a Langfuse-compatible 32-char hex trace ID."""
    return run_id.replace("-", "")


def get_run_callbacks(run_id: str) -> list[Any]:
    """Return per-run LangChain callback handlers with run_id pinned as trace ID.

    Pinning trace_id = run_id means Langfuse trace ID == LangGraph run_id,
    so frontend feedback scores land on the correct trace without any lookup.
    """
    if not is_configured():
        return []

    trace_id = _to_langfuse_trace_id(run_id)
    return [CallbackHandler(trace_context={"trace_id": trace_id})]


def record_score(run_id: str, score: float, name: str = "user_feedback") -> bool:
    """Record a user feedback score against a trace. Returns True if successful."""
    if not run_id or not is_configured():
        return False

    try:
        result = get_client().create_score(
            trace_id=_to_langfuse_trace_id(run_id),
            name=name,
            value=score,
        )
        return result is not None
    except Exception:
        logger.exception("Failed to record score for trace %s", run_id)
        return False
