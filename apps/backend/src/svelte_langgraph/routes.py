from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from .tracing import record_score

app = FastAPI()


class FeedbackPayload(BaseModel):
    run_id: str
    score: float


@app.post("/feedback", status_code=202)
async def feedback(payload: FeedbackPayload, background: BackgroundTasks) -> dict:
    """Accept a rating and score its trace out of band.

    202 rather than 200: scoring can't complete synchronously. The trace has
    to be looked up by run id and Langfuse takes seconds to make a freshly
    exported one queryable, so `record_score` may sit on a backoff far longer
    than a click should block for. The response acknowledges the rating; the
    background task is what lands it (and logs if it can't).
    """
    background.add_task(record_score, payload.run_id, payload.score)
    return {"ok": True}
