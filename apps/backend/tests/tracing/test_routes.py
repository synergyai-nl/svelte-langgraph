"""Tests for the /feedback endpoint mounted into Aegra via aegra.json."""

import httpx
import respx
from fastapi.testclient import TestClient

from svelte_langgraph.routes import app

from .test_tracing import ACCEPTED, RUN_ID, SCORE_URL, TRACE_ID


@respx.mock
def test_scores_the_run_and_reports_success(langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    with TestClient(app) as client:
        response = client.post("/feedback", json={"run_id": RUN_ID, "score": 1.0})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": True}
    assert score.calls.last.request.url == httpx.URL(SCORE_URL)
    assert TRACE_ID in score.calls.last.request.content.decode()


@respx.mock
def test_a_failed_score_reaches_the_caller(langfuse_env):
    """Scoring is awaited now, so a failure is answerable — the frontend rolls
    its optimistic thumb back on a non-ok response."""
    respx.post(SCORE_URL).mock(side_effect=httpx.ConnectError("unreachable"))

    with TestClient(app) as client:
        response = client.post("/feedback", json={"run_id": RUN_ID, "score": 0.0})

    assert response.status_code == 502


@respx.mock
def test_an_unconfigured_deployment_accepts_the_rating(no_langfuse_env):
    """Running without Langfuse is a deployment choice, not a failed click."""
    with TestClient(app) as client:
        response = client.post("/feedback", json={"run_id": RUN_ID, "score": 1.0})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": False}
    assert not respx.calls


def test_feedback_rejects_a_malformed_payload(langfuse_env):
    with TestClient(app) as client:
        assert client.post("/feedback", json={"score": 1.0}).status_code == 422
