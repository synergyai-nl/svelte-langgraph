"""Tests for the /feedback endpoint mounted into Aegra via aegra.json."""

import json
from contextlib import asynccontextmanager
from uuid import UUID

import httpx
import pytest
import respx
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from svelte_langgraph.feedback import views
from svelte_langgraph.http import app

from .conftest import (
    MESSAGE_ID,
    OTHER_USER_ID,
    THREAD_ID,
    USER_ID,
    ai_message,
)
from .test_tracing import ACCEPTED, SCORE_URL, TRACE_ID

OTHER_RUN_ID = "5b0c2d1e-7a44-4f0e-9c3b-6e1d2f8a9b70"
HUMAN = {"id": "human-1", "type": "human", "content": "hello"}


def rate(client, message_id=MESSAGE_ID, **extra):
    return client.post(
        "/feedback",
        json={"thread_id": THREAD_ID, "message_id": message_id, "score": "up", **extra},
    )


def sent_score(route) -> dict:
    return json.loads(route.calls.last.request.content)


@respx.mock
def test_scores_the_trace_of_the_run_that_produced_the_message(client, langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    response = rate(client)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": True}
    assert sent_score(score)["traceId"] == TRACE_ID


@respx.mock
def test_a_failed_score_reaches_the_caller(client, langfuse_env):
    """Scoring is awaited, so a failure is answerable — the frontend shows it
    and lets the user try again."""
    respx.post(SCORE_URL).mock(side_effect=httpx.ConnectError("unreachable"))

    assert rate(client).status_code == 502


@respx.mock
def test_an_unconfigured_deployment_accepts_the_rating(client, no_langfuse_env):
    """Running without Langfuse is a deployment choice, not a failed click."""
    response = rate(client)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "recorded": False}
    assert not respx.calls


@pytest.mark.parametrize(
    "body",
    [
        {"thread_id": THREAD_ID, "score": "up"},
        {"thread_id": THREAD_ID, "message_id": "", "score": "up"},
        {"thread_id": THREAD_ID, "message_id": MESSAGE_ID, "score": "sideways"},
        {"thread_id": "../runs", "message_id": MESSAGE_ID, "score": "up"},
    ],
    ids=["no-message", "empty-message", "bad-score", "thread-not-a-uuid"],
)
def test_feedback_rejects_a_malformed_payload(client, langfuse_env, body):
    assert client.post("/feedback", json=body).status_code == 422


@respx.mock
def test_an_unauthenticated_rating_is_rejected(real_auth, langfuse_env):
    """Deliberately not using the `client` fixture: this is the one case that
    must reach the real dependency.

    It takes `real_auth` all the same, which pins this project's own auth module
    in place of whatever Aegra resolves from the process CWD. Without it, running
    pytest from the repo root found no auth, and the route answered from the
    anonymous fallback instead of rejecting -- the very hole this guards.

    `enable_custom_route_auth` in aegra.json looks like it protects this route
    and does not (aegra_api 0.10.3, aegra_api/main.py:223), so nothing else
    would notice the route answering an anonymous caller.
    """
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    with TestClient(app) as anonymous:
        response = rate(anonymous)

    assert response.status_code == 401
    assert not score.calls


@respx.mock
@pytest.mark.parametrize("thread_visible", [False], indirect=True)
def test_a_thread_aegra_wont_show_the_caller_is_not_scorable(client, langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    assert rate(client).status_code == 404
    assert not score.calls


@respx.mock
@pytest.mark.parametrize("thread_visible", [False], indirect=True)
def test_access_is_checked_even_without_langfuse(client, no_langfuse_env):
    """The unconfigured path returns ok early. Were that early return first,
    the check would hold only where Langfuse happens to be set up."""
    assert rate(client).status_code == 404


@respx.mock
def test_the_thread_is_read_before_its_state(client, aegra, langfuse_env):
    """GET thread is the route documented to apply the auth handler's filters,
    so it has to be the one that gates."""
    respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    rate(client)

    assert [r.url.path for r in aegra.requests] == [
        f"/threads/{THREAD_ID}",
        f"/threads/{THREAD_ID}/state",
    ]


@respx.mock
@pytest.mark.parametrize(
    "messages",
    [[HUMAN], [HUMAN, ai_message(run_id=None)]],
    indirect=True,
    ids=["absent", "predates-the-stamp"],
)
def test_a_message_without_a_known_run_is_not_scorable(client, langfuse_env):
    """A pre-stamp answer's trace got a random id, so no run id leads to it --
    refused rather than scored onto a trace that doesn't exist."""
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    assert rate(client).status_code == 404
    assert not score.calls


@respx.mock
def test_a_human_message_is_not_scorable(client, langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    assert rate(client, message_id=HUMAN["id"]).status_code == 404
    assert not score.calls


@respx.mock
@pytest.mark.parametrize(
    "messages",
    [[HUMAN, ai_message("first"), ai_message("second", OTHER_RUN_ID)]],
    indirect=True,
)
def test_each_message_is_scored_on_its_own_runs_trace(client, langfuse_env):
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    rate(client, message_id="first")
    first = sent_score(score)
    rate(client, message_id="second")
    second = sent_score(score)

    assert first["traceId"] == TRACE_ID
    assert second["traceId"] == UUID(OTHER_RUN_ID).hex


@respx.mock
@pytest.mark.parametrize(
    "messages", [[HUMAN, ai_message("a"), ai_message("b")]], indirect=True
)
def test_two_answers_from_one_run_keep_separate_scores(client, langfuse_env):
    """Same run, same trace -- but rating one must not overwrite the other."""
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    rate(client, message_id="a")
    a = sent_score(score)
    rate(client, message_id="b", score="down")
    b = sent_score(score)

    assert a["traceId"] == b["traceId"] == TRACE_ID
    assert a["id"] != b["id"]


@respx.mock
def test_a_resubmission_updates_the_same_score(client, langfuse_env):
    """A reload forgets the UI state, so rating again must upsert, not add."""
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    rate(client)
    first = sent_score(score)
    rate(client, score="down")

    assert sent_score(score)["id"] == first["id"]


def test_the_score_id_follows_the_caller():
    assert views.score_id(USER_ID, THREAD_ID, MESSAGE_ID) != views.score_id(
        OTHER_USER_ID, THREAD_ID, MESSAGE_ID
    )


async def test_aegra_is_called_in_process_as_the_caller():
    """Not under the `client` fixture, which replaces this dependency: the
    point is that the real one reaches the app's own routes with the caller's
    token, so Aegra authorizes the read as them."""
    inner = FastAPI()
    seen: list[str | None] = []

    @inner.get("/threads/{thread_id}")
    def get_thread(thread_id: str, request: Request):
        seen.append(request.headers.get("authorization"))
        return {"thread_id": thread_id}

    request = Request(
        {
            "type": "http",
            "app": inner,
            "headers": [(b"authorization", b"Bearer caller-token")],
        }
    )
    async with asynccontextmanager(views.aegra_client)(request) as aegra:
        response = await aegra.get(f"/threads/{THREAD_ID}")

    assert response.json() == {"thread_id": THREAD_ID}
    assert seen == ["Bearer caller-token"]


@respx.mock
@pytest.mark.parametrize("caller_id", [""], indirect=True)
def test_a_caller_without_an_identity_is_rejected(client, langfuse_env):
    """The score id is keyed on the identity, so an empty one has nothing to
    key on. Only "" is testable: User.identity is typed str."""
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    assert rate(client).status_code == 401
    assert not score.calls


@respx.mock
@pytest.mark.parametrize("authenticated", [False], indirect=True)
def test_a_user_flagged_unauthenticated_is_rejected(client, langfuse_env):
    """require_auth admits whatever its backend returns without reading
    is_authenticated. aegra/aegra#459 sets that flag on the anonymous user, so
    relying on Aegra to act on it would leave the endpoint open once #459
    ships."""
    score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

    assert rate(client).status_code == 401
    assert not score.calls
