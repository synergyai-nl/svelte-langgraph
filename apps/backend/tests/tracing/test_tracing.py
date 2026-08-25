"""Tests for scoring a run's trace in Langfuse.

Aegra exports the trace; the only thing under test here is the lookup that
turns a LangGraph `run_id` into the trace id Langfuse assigned, and the score
that follows it.
"""

import json

import httpx
import pytest
import respx

from svelte_langgraph.tracing import record_score

from .conftest import BASE_URL

RUN_ID = "2762a745-00bb-4933-a51a-eddd65679b75"
TRACE_ID = "bcd6860db954b88443b8f91a65360dc8"


def trace_page(*ids: str) -> httpx.Response:
    return httpx.Response(200, json={"data": [{"id": i} for i in ids]})


EMPTY = httpx.Response(200, json={"data": []})


@respx.mock
async def test_no_score_without_credentials(no_langfuse_env):
    """Langfuse is optional, so an unconfigured deployment must no-op rather
    than raise — and must not reach out to the default localhost host either."""
    assert await record_score(RUN_ID, 1.0) is False
    assert not respx.calls


@respx.mock
async def test_scores_the_trace_belonging_to_the_run(langfuse_env):
    lookup = respx.get(f"{BASE_URL}/api/public/traces").mock(
        return_value=trace_page(TRACE_ID)
    )
    score = respx.post(f"{BASE_URL}/api/public/scores").mock(
        return_value=httpx.Response(200, json={"id": "score-1"})
    )

    assert await record_score(RUN_ID, 1.0) is True

    # The run id has to go through as a metadata filter, not a free-text
    # search: it is what ties the score to the run that earned it.
    sent_filter = json.loads(lookup.calls.last.request.url.params["filter"])
    assert sent_filter == [
        {
            "type": "stringObject",
            "column": "metadata",
            "key": "run_id",
            "operator": "=",
            "value": RUN_ID,
        }
    ]

    assert json.loads(score.calls.last.request.content) == {
        "traceId": TRACE_ID,
        "name": "user_feedback",
        "value": 1.0,
    }


@respx.mock
async def test_score_name_is_overridable(langfuse_env):
    respx.get(f"{BASE_URL}/api/public/traces").mock(return_value=trace_page(TRACE_ID))
    score = respx.post(f"{BASE_URL}/api/public/scores").mock(
        return_value=httpx.Response(200, json={"id": "score-1"})
    )

    assert await record_score(RUN_ID, 0.0, name="thumbs") is True
    assert json.loads(score.calls.last.request.content)["name"] == "thumbs"


@respx.mock
async def test_waits_for_the_trace_to_be_ingested(langfuse_env, instant_retries):
    """Langfuse takes seconds to make a freshly exported trace queryable, and
    people rate a reply immediately. The first lookups finding nothing is the
    normal case, not a failure."""
    lookup = respx.get(f"{BASE_URL}/api/public/traces").mock(
        side_effect=[EMPTY, EMPTY, trace_page(TRACE_ID)]
    )
    score = respx.post(f"{BASE_URL}/api/public/scores").mock(
        return_value=httpx.Response(200, json={"id": "score-1"})
    )

    assert await record_score(RUN_ID, 1.0) is True
    assert lookup.call_count == 3
    assert score.call_count == 1


@respx.mock
async def test_gives_up_when_the_trace_never_arrives(langfuse_env, instant_retries):
    lookup = respx.get(f"{BASE_URL}/api/public/traces").mock(return_value=EMPTY)
    score = respx.post(f"{BASE_URL}/api/public/scores")

    assert await record_score(RUN_ID, 1.0) is False
    assert lookup.call_count > 1
    assert not score.called


@respx.mock
async def test_langfuse_errors_do_not_escape(langfuse_env, caplog):
    """`record_score` runs detached from the request that triggered it, so a
    raised exception would surface as an unhandled task error rather than
    anything actionable."""
    respx.get(f"{BASE_URL}/api/public/traces").mock(
        return_value=httpx.Response(401, json={"message": "unauthorized"})
    )

    assert await record_score(RUN_ID, 1.0) is False
    assert "Failed to record score" in caplog.text


@pytest.mark.parametrize("run_id", ["", None])
@respx.mock
async def test_missing_run_id_is_not_an_error(langfuse_env, run_id):
    assert await record_score(run_id, 1.0) is False
    assert not respx.calls
