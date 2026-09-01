"""Tests for the /feedback endpoint mounted into Aegra via aegra.json."""

import httpx
import respx
from fastapi.testclient import TestClient

from svelte_langgraph.routes import app

from .test_tracing import ACCEPTED, RUN_ID, SCORE_URL, TRACE_ID


@respx.mock
def test_scores_the_run_and_reports_success(client, langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    response = client.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": True}
    assert score.calls.last.request.url == httpx.URL(SCORE_URL)
    assert TRACE_ID in score.calls.last.request.content.decode()


@respx.mock
def test_a_failed_score_reaches_the_caller(client, langfuse_env):
    """Scoring is awaited now, so a failure is answerable — the frontend rolls
    its optimistic thumb back on a non-ok response."""
    respx.post(SCORE_URL).mock(side_effect=httpx.ConnectError("unreachable"))

    response = client.post("/feedback", json={"run_id": RUN_ID, "score": "down"})

    assert response.status_code == 502


@respx.mock
def test_an_unconfigured_deployment_accepts_the_rating(client, no_langfuse_env):
    """Running without Langfuse is a deployment choice, not a failed click."""
    response = client.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": False}
    assert not respx.calls


def test_feedback_rejects_a_malformed_payload(client, langfuse_env):
    assert client.post("/feedback", json={"score": "up"}).status_code == 422
    assert (
        client.post(
            "/feedback", json={"run_id": RUN_ID, "score": "sideways"}
        ).status_code
        == 422
    )


@respx.mock
def test_an_unauthenticated_rating_is_rejected(langfuse_env):
    """Deliberately not using the `client` fixture: this is the one case that
    must reach the real dependency.

    Guards a silent failure mode. `enable_custom_route_auth` in aegra.json looks
    like it protects this route and does not -- it assigns to `route.dependencies`
    after FastAPI has built `route.dependant` from it (aegra_api 0.10.3,
    aegra_api/main.py:217), so the dependency is stored and never run. Nothing
    else here would notice: every other test authenticates, and the route would
    answer 200 to an anonymous caller exactly as it does to a signed-in one.
    """
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    with TestClient(app) as anonymous:
        response = anonymous.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    assert response.status_code == 401
    assert not score.calls
