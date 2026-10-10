"""The /feedback route handler."""

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

import httpx
from aegra_api.core.auth_deps import require_auth
from aegra_api.models import User
from fastapi import Depends, HTTPException, Request

from svelte_langgraph.tracing import is_configured, record_score

from .provenance import run_id_for_message
from .types import FeedbackPayload


async def aegra_client(request: Request) -> AsyncIterator[httpx.AsyncClient]:
    """Aegra's own public API, called in-process as the caller.

    Aegra mounts its routes onto our custom app, so `request.app` serves them.
    Going through them rather than its ORM means a deployment's thread auth
    handlers apply to feedback exactly as they apply to reading the thread.
    """
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=request.app),
        base_url="http://aegra",
        headers={"Authorization": request.headers.get("authorization", "")},
    ) as client:
        yield client


def score_id(user_id: str, thread_id: str, message_id: str) -> str:
    """One score per user per answer, so a resubmission after a reload updates
    the earlier score instead of adding a second one."""
    return uuid5(NAMESPACE_URL, f"feedback:{user_id}:{thread_id}:{message_id}").hex


async def _get(client: httpx.AsyncClient, *segments: str) -> dict:
    response = await client.get(httpx.URL(path="/" + "/".join(segments)))
    # 403 included: "not yours" and "no such thread" must read the same.
    if response.status_code in (403, 404):
        raise HTTPException(status_code=404, detail="Thread not found")
    response.raise_for_status()
    return response.json()


# require_auth is declared here, not left to `enable_custom_route_auth` in
# aegra.json, which enforces nothing (aegra_api 0.10.3, main.py:223).
async def feedback(
    payload: FeedbackPayload,
    user: Annotated[User, Depends(require_auth)],
    aegra: Annotated[httpx.AsyncClient, Depends(aegra_client)],
) -> dict:
    """Attach a rating to the trace of the run that produced the message."""
    if not user.is_authenticated or not user.identity:
        raise HTTPException(status_code=401, detail="Authentication required")

    thread_id = str(payload.thread_id)
    # The thread first: GET state alone is not documented to apply the
    # handler's filters, GET thread is.
    await _get(aegra, "threads", thread_id)
    state = await _get(aegra, "threads", thread_id, "state")

    run_id = run_id_for_message(
        (state.get("values") or {}).get("messages") or [], payload.message_id
    )
    if run_id is None:
        raise HTTPException(status_code=404, detail="No rateable message with that id")

    if not is_configured():
        # Langfuse is optional, and its absence is a deployment choice — not
        # something to report as a failed click.
        return {"ok": True, "recorded": False}

    if not await record_score(
        run_id,
        payload.score,
        score_id=score_id(user.identity, thread_id, payload.message_id),
        comment=payload.comment,
    ):
        raise HTTPException(status_code=502, detail="Failed to record feedback score")

    return {"ok": True, "recorded": True}
