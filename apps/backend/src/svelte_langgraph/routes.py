from typing import Annotated

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, StringConstraints

from .tracing import Rating, is_configured, record_score

app = FastAPI()


# Kept in step with COMMENT_MAX_LENGTH in
# apps/frontend/src/routes/api/feedback/+server.ts, which applies the same limit
# a hop earlier. Both count code points so the number means one thing.
COMMENT_MAX_LENGTH = 2000

# Stripped before the length check, so trailing newlines don't eat the budget and
# a whitespace-only box arrives as "" -- falsy, so record_score omits the key
# rather than attaching a blank comment to the score.
Comment = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=COMMENT_MAX_LENGTH),
]


class FeedbackPayload(BaseModel):
    run_id: str
    score: Rating
    # Optional by design: the rating is the feedback, and the comment is an
    # afterthought the user may never give.
    comment: Comment | None = None


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

    if not await record_score(payload.run_id, payload.score, comment=payload.comment):
        raise HTTPException(status_code=502, detail="Failed to record feedback score")

    return {"ok": True, "recorded": True}
