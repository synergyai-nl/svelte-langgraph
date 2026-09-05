"""Tests for the /feedback endpoint mounted into Aegra via aegra.json."""

import httpx
import respx
from fastapi.testclient import TestClient

from svelte_langgraph.routes import app

import pytest

from .conftest import OTHER_USER_ID, RUN_ID, USER_ID
from .test_tracing import ACCEPTED, SCORE_URL, TRACE_ID


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


@respx.mock
@pytest.mark.parametrize("run_owner", [None], indirect=True)
def test_a_run_the_caller_does_not_own_is_not_scorable(client, langfuse_env):
    """Authentication alone was never enough: every signed-in user could score
    every run, since a run id is the only thing identifying what is being rated
    and it is readable by anyone who can see the trace.

    404 rather than 403 -- "not yours" and "no such run" are the same answer
    here, and separating them would confirm the run exists.
    """
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    response = client.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    assert response.status_code == 404
    assert not score.calls


@respx.mock
@pytest.mark.parametrize("run_owner", [None], indirect=True)
def test_ownership_is_checked_even_without_langfuse(client, no_langfuse_env):
    """The unconfigured path returns ok early. If that early return came first,
    the ownership check would hold only where Langfuse happens to be set up --
    passing tests and an open endpoint in exactly the deployments least likely
    to notice."""
    response = client.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    assert response.status_code == 404


@respx.mock
@pytest.mark.parametrize(
    "caller_id", [USER_ID, OTHER_USER_ID], indirect=True, ids=["owner", "other"]
)
def test_the_ownership_query_is_scoped_to_the_caller(
    client, session, caller_id, langfuse_env
):
    """Asserts the SQL, not just that a query happened.

    The stub answers whatever it is asked, so a lookup by run id alone would
    return the run and satisfy every other test here -- while letting any
    signed-in user score any run. Only the WHERE clause distinguishes them.

    Run for two callers because one caller proves too little: a route that
    filtered on a hardcoded identity, or on the wrong User field, would satisfy
    a single-identity assertion. The clause has to follow whoever is asking.
    """
    respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    client.post("/feedback", json={"run_id": RUN_ID, "score": "up"})

    sql = session.compiled_sql()
    assert f"runs.user_id = '{caller_id}'" in sql
    assert f"runs.run_id = '{RUN_ID}'" in sql


@respx.mock
def test_a_run_id_that_is_not_a_uuid_is_rejected(client, langfuse_env):
    """422 naming run_id, not a 404 that would read as a missing run."""
    response = client.post("/feedback", json={"run_id": "not-a-uuid", "score": "up"})

    assert response.status_code == 422
