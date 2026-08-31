from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .tracing import is_configured, record_score

app = FastAPI()


class FeedbackPayload(BaseModel):
    run_id: str
    score: float


@app.post("/feedback")
async def feedback(payload: FeedbackPayload) -> dict:
    """Attach a rating to the run's trace.

    Awaited rather than detached: the trace id is derived from the run id, so
    this is one fast POST with no lookup and no wait for ingestion. That makes
    a failure something the caller can actually be told about.
    """
    if not is_configured():
        # Langfuse is optional, and its absence is a deployment choice — not
        # something to report as a failed click.
        return {"ok": True, "recorded": False}

    if not await record_score(payload.run_id, payload.score):
        raise HTTPException(status_code=502, detail="Failed to record feedback score")

    return {"ok": True, "recorded": True}
