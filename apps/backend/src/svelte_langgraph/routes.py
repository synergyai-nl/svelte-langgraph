from typing import Annotated
from uuid import UUID

from aegra_api.core.auth_deps import require_auth
from aegra_api.core.auth_middleware import LangGraphAuthBackend, get_auth_backend
from aegra_api.core.orm import Run as RunORM
from aegra_api.core.orm import get_session
from aegra_api.models import User
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .tracing import Rating, is_configured, record_score

app = FastAPI()


@app.middleware("http")
async def refuse_to_serve_without_auth(request: Request, call_next):
    """Answer nothing at all rather than answer everyone as the same user.

    Aegra swallows any exception raised while importing our auth module
    (auth_middleware.py:104), then authenticates every caller as "anonymous"
    with is_authenticated=True. That passes require_auth, and because runs
    created in that state are also owned by "anonymous", the ownership check
    below matches for everybody. A broken deployment is much better than an
    open one, so refuse the request instead.

    Aegra applies its own routers to this app, so this covers threads, runs and
    the store too -- not just /feedback.

    Remove once aegra/aegra#459 ships: it makes the anonymous user
    is_authenticated=False, which is the same fix a layer down.
    """
    # Narrowed rather than duck-typed: get_auth_backend is annotated as the
    # Starlette base class, and a backend we do not recognise is not one we can
    # claim has auth installed -- so that refuses too.
    backend = get_auth_backend()
    if not isinstance(backend, LangGraphAuthBackend) or backend.auth_instance is None:
        return JSONResponse(
            status_code=503,
            content={"detail": "Authentication is not installed; refusing to serve"},
        )
    return await call_next(request)


# Kept in step with COMMENT_MAX_LENGTH in
# apps/frontend/src/lib/langgraph/feedback.ts, which applies the same limit
# before posting. Both count code points so the number means one thing.
COMMENT_MAX_LENGTH = 2000

# Stripped before the length check, so trailing newlines don't eat the budget and
# a whitespace-only box arrives as "" -- falsy, so record_score omits the key
# rather than attaching a blank comment to the score.
Comment = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=COMMENT_MAX_LENGTH),
]


class FeedbackPayload(BaseModel):
    # UUID, not str: the trace id is this id's hex, so a non-UUID matches nothing.
    run_id: UUID
    score: Rating
    # Optional by design: the rating is the feedback, and the comment is an
    # afterthought the user may never give.
    comment: Comment | None = None


# require_auth is declared here and not left to `enable_custom_route_auth` in
# aegra.json: that flag assigns to route.dependencies after FastAPI has built
# route.dependant from it, so it enforces nothing (aegra_api 0.10.3, main.py:217).
#
# It also fails open. Aegra swallows any exception from loading our auth module
# (auth_middleware.py:104) and then authenticates everyone as "anonymous", which
# passes require_auth and makes the ownership check below compare "anonymous" to
# itself. A warning in the log is the only sign. See #302.
@app.post("/feedback")
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
    # Before the is_configured early return, so it holds without Langfuse too.
    owned = await session.scalar(
        select(RunORM.run_id).where(
            RunORM.run_id == str(payload.run_id),
            RunORM.user_id == user.identity,
        )
    )
    if owned is None:
        # 404, not 403: don't confirm someone else's run exists.
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
