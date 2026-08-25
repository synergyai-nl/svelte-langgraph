"""Tests for the /feedback endpoint mounted into Aegra via aegra.json."""

import httpx
import respx
from fastapi.testclient import TestClient

from svelte_langgraph.routes import app

from .conftest import BASE_URL
from .test_tracing import RUN_ID, TRACE_ID, trace_page


@respx.mock
def test_feedback_acknowledges_then_scores(langfuse_env):
    """202, not 200: the score is landed by a background task because the
    trace lookup can outlast any reasonable request timeout."""
    respx.get(f"{BASE_URL}/api/public/traces").mock(return_value=trace_page(TRACE_ID))
    score = respx.post(f"{BASE_URL}/api/public/scores").mock(
        return_value=httpx.Response(200, json={"id": "score-1"})
    )

    with TestClient(app) as client:
        response = client.post("/feedback", json={"run_id": RUN_ID, "score": 1.0})

    assert response.status_code == 202
    # TestClient runs background tasks before returning, so by here the
    # detached work has completed.
    assert score.call_count == 1


@respx.mock
def test_feedback_is_accepted_even_when_langfuse_is_unreachable(langfuse_env):
    """A failed score must not be reported to the user as a failed rating —
    there is nothing they could do about it, and the click already happened."""
    respx.get(f"{BASE_URL}/api/public/traces").mock(side_effect=httpx.ConnectError("x"))

    with TestClient(app) as client:
        response = client.post("/feedback", json={"run_id": RUN_ID, "score": 0.0})

    assert response.status_code == 202


def test_feedback_rejects_a_malformed_payload(langfuse_env):
    with TestClient(app) as client:
        assert client.post("/feedback", json={"score": 1.0}).status_code == 422
