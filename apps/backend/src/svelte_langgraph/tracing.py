from typing import Any

from langfuse import get_client
from langfuse.langchain import CallbackHandler

def _to_langfuse_trace_id(run_id: str) -> str | None:
    """Convert a LangGraph run_id (UUIDv7) to a Langfuse-compatible 32-char hex trace ID."""
    return run_id.replace("-", "") if run_id else None


def get_run_callbacks(run_id: str) -> list[Any]:
    """Return per-run LangChain callback handlers with run_id pinned as trace ID.

    Pinning trace_id = run_id means Langfuse trace ID == LangGraph run_id,
    so frontend feedback scores land on the correct trace without any lookup.
    """
    trace_id = _to_langfuse_trace_id(run_id)
    return CallbackHandler(trace_context={"trace_id": trace_id})


def record_score(run_id: str, score: float, name: str = "user_feedback") -> bool:
    """Record a user feedback score against a trace. Returns True if successful."""
    if not run_id:
        return False

    try:
        result = get_client().create_score(
            trace_id=_to_langfuse_trace_id(run_id),
            name=name,
            value=score,
        )
        return result is not None
    except Exception as e:
        print(f"Failed to record score for trace {run_id}: {e}")
        return False
