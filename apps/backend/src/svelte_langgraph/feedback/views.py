"""The /feedback route handler."""

from typing import Annotated

from aegra_api.core.auth_deps import require_auth
from aegra_api.core.auth_filters import build_metadata_filter
from aegra_api.core.auth_handlers import build_auth_context, handle_event
from aegra_api.core.orm import Run as RunORM
from aegra_api.core.orm import Thread as ThreadORM
from aegra_api.core.orm import get_session
from aegra_api.models import User
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from svelte_langgraph.tracing import is_configured, record_score

from .types import FeedbackPayload

# require_auth is declared here and not left to `enable_custom_route_auth` in
# aegra.json: that flag assigns to route.dependencies after FastAPI has built
# route.dependant from it, so it enforces nothing (aegra_api 0.10.3, main.py:223).
#
# It also fails open: Aegra swallows any exception from loading our auth module
# (auth_middleware.py:104) and authenticates everyone as "anonymous", which
# passes require_auth. Not worked around here -- runs made before the breakage
# are still owned by real identities, so the check below refuses them, and only
# a deployment that never authenticated anyone is exposed. Tracked in #302 and
# fixed upstream by aegra/aegra#459.
async def feedback(
    payload: FeedbackPayload,
    user: Annotated[User, Depends(require_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Attach a rating to the run's trace.

    Awaited rather than detached: the trace id is derived from the run id, so
    this is one fast POST with no lookup and no wait for ingestion. That makes
    a failure something the caller can actually be told about.
    """
    if not user.is_authenticated or not user.identity:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Authorized via the thread, not the run: Aegra's own GET /runs/{id}
    # discards the filters its auth handler returns (aegra_api 0.10.8,
    # api/runs.py get_run); GET /threads/{id} applies them. Mirroring the
    # latter honors a deployment's custom handler the same way.
    ctx = build_auth_context(user, "threads", "read")
    filters = await handle_event(ctx, {"thread_id": payload.thread_id})

    stmt = select(ThreadORM.thread_id).where(
        ThreadORM.thread_id == payload.thread_id,
        ThreadORM.user_id == user.identity,
    )
    auth_filter = build_metadata_filter(ThreadORM.metadata_json, filters)
    if auth_filter is not None:
        stmt = stmt.where(auth_filter)

    if await session.scalar(stmt) is None:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Not a second ownership gate -- just confirming the named run actually
    # belongs to the thread the caller was just cleared for.
    run_in_thread = await session.scalar(
        select(RunORM.run_id).where(
            RunORM.run_id == str(payload.run_id),
            RunORM.thread_id == payload.thread_id,
        )
    )
    if run_in_thread is None:
        raise HTTPException(status_code=404, detail="Run not found")

    if not is_configured():
        # Langfuse is optional, and its absence is a deployment choice — not
        # something to report as a failed click.
        return {"ok": True, "recorded": False}

    if not await record_score(
        str(payload.run_id), payload.score, comment=payload.comment
    ):
        raise HTTPException(status_code=502, detail="Failed to record feedback score")

    return {"ok": True, "recorded": True}
