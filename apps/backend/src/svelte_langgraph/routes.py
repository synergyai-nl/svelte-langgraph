from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .tracing import record_score

app = FastAPI()


class FeedbackPayload(BaseModel):
    run_id: str
    score: float


@app.post("/feedback")
async def feedback(payload: FeedbackPayload) -> dict:
    if record_score(payload.run_id, payload.score):
        return {"ok": True}
    else:
        raise HTTPException(status_code=500, detail="Failed to record feedback score")
