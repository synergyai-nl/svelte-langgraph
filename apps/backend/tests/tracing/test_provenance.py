"""Tests for recording which run produced each AI message."""

import uuid

from langchain_core.runnables import RunnableConfig

from svelte_langgraph.feedback.provenance import run_id_for_message
from svelte_langgraph.graph import make_graph
from tests.conftest import make_completion_response

from .conftest import RUN_ID, ai_message


async def answer(config: RunnableConfig) -> dict:
    result = await make_graph(config).ainvoke(
        {"messages": [{"role": "user", "content": "hello"}]}, config
    )
    return result["messages"][-1].response_metadata


async def test_an_answer_carries_the_run_that_produced_it(mock_completion):
    mock_completion.mock(return_value=make_completion_response("hi there"))
    run_id = str(uuid.uuid4())

    metadata = await answer(
        RunnableConfig(configurable={"thread_id": "t1", "run_id": run_id})
    )

    assert metadata["run_id"] == run_id


async def test_an_answer_outside_a_run_is_left_unstamped(mock_completion):
    """The CLI loop has no server-issued run id; nothing to stamp, nothing to fail."""
    mock_completion.mock(return_value=make_completion_response("hi there"))

    metadata = await answer(RunnableConfig(configurable={"thread_id": "t1"}))

    assert "run_id" not in metadata


def test_finds_the_stamped_run_of_a_message():
    assert run_id_for_message([ai_message("m", RUN_ID)], "m") == RUN_ID


def test_an_unknown_or_unstamped_message_has_no_run():
    messages = [ai_message("old", None), {"id": "h", "type": "human"}]
    assert run_id_for_message(messages, "old") is None
    assert run_id_for_message(messages, "h") is None
    assert run_id_for_message(messages, "missing") is None
