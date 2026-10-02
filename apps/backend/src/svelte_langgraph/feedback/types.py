"""Request/response shapes for the /feedback route."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from svelte_langgraph.tracing import Rating

# Kept in step with COMMENT_MAX_LENGTH in
# apps/frontend/src/lib/langgraph/feedback.ts, which applies the same limit
# before posting. Both count code points so the number means one thing.
COMMENT_MAX_LENGTH = 2000

# Stripped before the length check, so trailing newlines don't eat the budget and
# a whitespace-only box arrives as "". record_score sends the comment either way:
# the score id makes it an upsert, so a blank has to overwrite whatever a
# previous rating left there.
Comment = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=COMMENT_MAX_LENGTH),
]


class FeedbackPayload(BaseModel):
    # UUID, not str: the trace id is this id's hex, so a non-UUID matches nothing.
    thread_id: str
    run_id: UUID
    score: Rating
    # Optional by design: the rating is the feedback, and the comment is an
    # afterthought the user may never give.
    comment: Comment | None = None
