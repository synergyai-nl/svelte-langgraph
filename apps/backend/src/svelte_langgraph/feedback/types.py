"""Request/response shapes for the /feedback route."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from svelte_langgraph.tracing import Rating

# The frontend mirrors this in feedbackLimits.ts to cap the comment box. This
# one is the limit that's enforced.
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
    # UUID, not str: it becomes a path segment of the Aegra calls in views.py.
    thread_id: UUID
    # The answer being rated. Its producing run is looked up server-side, so a
    # client can't point a rating at some other run's trace.
    message_id: Annotated[str, StringConstraints(min_length=1, max_length=256)]
    score: Rating
    # Optional by design: the rating is the feedback, and the comment is an
    # afterthought the user may never give.
    comment: Comment | None = None
