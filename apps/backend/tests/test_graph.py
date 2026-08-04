"""Unit tests for the LangGraph agent graph.

This module contains tests for the LangGraph agent, covering:
- Basic conversation flow
- State maintenance across invocations
- Tool invocation and execution
- Tool output verification
- State-only submit (phase sync without LLM call)
- Phase tool and schema
"""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig


@pytest.mark.asyncio
async def test_basic_conversation(
    agent, thread_config: RunnableConfig, openai_basic_conversation
):
    """Test basic conversation with user prompt and AI generation.

    This test verifies:
    1. The agent can process a simple user message
    2. The agent returns an AI response
    3. The initial greeting message is present in the conversation
    4. The conversation state is properly maintained
    """
    user_message = "Hello, how are you?"

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=user_message)]},
        thread_config,
    )

    assert "messages" in result
    messages = result["messages"]

    assert len(messages) >= 2

    user_msg = messages[0]
    assert isinstance(user_msg, HumanMessage)
    assert user_msg.content == user_message

    ai_response = messages[1]
    assert isinstance(ai_response, AIMessage)
    assert ai_response.content is not None
    assert isinstance(ai_response.content, str)
    assert len(ai_response.content) > 0
    assert (
        "help" in ai_response.content.lower() or "great" in ai_response.content.lower()
    )


@pytest.mark.asyncio
async def test_conversation_maintains_state(
    agent, thread_config: RunnableConfig, openai_basic_conversation
):
    """Test that conversation state is maintained across multiple invocations.

    This test verifies:
    1. Multiple messages can be sent in sequence
    2. The conversation history grows appropriately
    3. Previous messages are retained in state
    """
    first_message = "What's your name?"

    result1 = await agent.ainvoke(
        {"messages": [HumanMessage(content=first_message)]},
        thread_config,
    )

    messages_after_first = result1["messages"]
    first_message_count = len(messages_after_first)

    assert first_message_count >= 2

    second_message = "Tell me more"

    result2 = await agent.ainvoke(
        {"messages": [HumanMessage(content=second_message)]},
        thread_config,
    )

    messages_after_second = result2["messages"]

    assert len(messages_after_second) > first_message_count

    assert any(
        msg.content == first_message
        for msg in messages_after_second
        if isinstance(msg, HumanMessage)
    )
    assert any(
        msg.content == second_message
        for msg in messages_after_second
        if isinstance(msg, HumanMessage)
    )


@pytest.mark.asyncio
async def test_single_tool_call(
    agent,
    thread_config: RunnableConfig,
    openai_single_tool_call,
):
    """Test single tool call with user prompt, tool invocation, and AI response.

    This test verifies:
    1. The agent can recognize when to call a tool
    2. The tool is invoked with correct arguments
    3. The tool response is processed
    4. The agent generates a final response incorporating the tool output
    """
    user_message = "What's the weather like in Paris?"

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=user_message)]},
        thread_config,
    )

    assert "messages" in result
    messages = result["messages"]

    user_msg = messages[0]
    assert isinstance(user_msg, HumanMessage)
    assert user_msg.content == user_message

    tool_call_found = False
    tool_response_found = False
    final_ai_response_found = False

    for msg in messages[1:]:
        if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
            tool_call_found = True
            tool_calls = msg.tool_calls
            assert len(tool_calls) >= 1

            tool_call = tool_calls[0]
            assert tool_call["name"] == "get_weather"
            assert "city" in tool_call["args"]
            assert tool_call["args"]["city"] == "Paris"

        elif isinstance(msg, ToolMessage):
            tool_response_found = True
            assert isinstance(msg.content, str)
            assert "sunny" in msg.content.lower() or "Paris" in msg.content

        elif (
            isinstance(msg, AIMessage)
            and msg.content
            and not (hasattr(msg, "tool_calls") and msg.tool_calls)
        ):
            final_ai_response_found = True
            assert isinstance(msg.content, str)
            assert len(msg.content) > 0
            assert "sunny" in msg.content.lower() or "Paris" in msg.content

    assert tool_call_found, "No tool call found in messages"
    assert tool_response_found, "No tool response found in messages"
    assert final_ai_response_found, "No final AI response found in messages"


@pytest.mark.asyncio
async def test_tool_execution_result(
    agent,
    thread_config: RunnableConfig,
    openai_single_tool_call,
):
    """Test that the tool is actually executed and returns expected results.

    This test verifies:
    1. The get_weather tool is invoked
    2. The tool returns the expected format
    3. The tool output is included in the conversation
    """
    user_message = "Check the weather in London"

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=user_message)]},
        thread_config,
    )

    messages = result["messages"]

    tool_messages = [msg for msg in messages if isinstance(msg, ToolMessage)]

    assert len(tool_messages) >= 1, "Expected at least one tool message"

    tool_message = tool_messages[0]
    assert tool_message.name == "get_weather"

    assert isinstance(tool_message.content, str)
    assert "sunny" in tool_message.content.lower()


@pytest.mark.asyncio
async def test_state_only_submit(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """State-only submit applies phase and ends without invoking the LLM."""
    result = await agent.ainvoke({"phase": "draft"}, thread_config)

    assert result["phase"] == "draft"
    # No AI messages should be added for a state-only submit
    ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
    assert len(ai_messages) == 0
    # The OpenAI endpoint must not have been called
    assert mock_completion_optional.call_count == 0


@pytest.mark.asyncio
async def test_state_only_submit_default_phase(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """State-only submit with no phase normalizes to 'research'."""
    result = await agent.ainvoke({"messages": []}, thread_config)

    assert result["phase"] == "research"
    assert mock_completion_optional.call_count == 0


@pytest.mark.asyncio
async def test_change_phase_tool(
    agent,
    thread_config: RunnableConfig,
    openai_change_phase_tool_call,
):
    """change_phase tool updates state phase and adds ToolMessage."""
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Please switch to the review phase")]},
        thread_config,
    )

    assert result["phase"] == "review"

    tool_messages = [m for m in result["messages"] if isinstance(m, ToolMessage)]
    assert any("Phase changed to review." in m.content for m in tool_messages), (
        f"Expected 'Phase changed to review.' in tool messages, got: {[m.content for m in tool_messages]}"
    )


@pytest.mark.asyncio
async def test_change_phase_tool_parallel_calls_last_write_wins(
    agent,
    thread_config: RunnableConfig,
    openai_double_change_phase_tool_call,
):
    """Two `change_phase` tool calls in one assistant message (parallel tool
    calls) must not crash with LangGraph's InvalidUpdateError -- `phase` is
    annotated with the `last_value` reducer precisely to fold concurrent
    per-step writes instead of raising. The LAST tool call in the message
    ("review") wins over the first ("draft"), matching ToolNode's
    executor.map, which preserves tool_call order. Both ToolMessages must
    still be present and correlated to their originating tool_call_id, and
    the run must complete with a final AI message.
    """
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Switch to draft, then review")]},
        thread_config,
    )

    assert result["phase"] == "review"

    ai_tool_call_msg = next(
        m for m in result["messages"] if isinstance(m, AIMessage) and m.tool_calls
    )
    assert [tc["id"] for tc in ai_tool_call_msg.tool_calls] == [
        "call_phase_1",
        "call_phase_2",
    ]

    tool_messages_by_id = {
        m.tool_call_id: m for m in result["messages"] if isinstance(m, ToolMessage)
    }
    assert set(tool_messages_by_id) == {"call_phase_1", "call_phase_2"}
    assert "Phase changed to draft." in tool_messages_by_id["call_phase_1"].content
    assert "Phase changed to review." in tool_messages_by_id["call_phase_2"].content

    final_ai_messages = [
        m for m in result["messages"] if isinstance(m, AIMessage) and m.content
    ]
    assert final_ai_messages, "Expected a final AI message after both tool calls"
    assert final_ai_messages[-1].content == "I've changed the phase to review."


@pytest.mark.asyncio
async def test_change_phase_tool_invalid_arg_from_llm_is_graceful(
    agent, thread_config: RunnableConfig, mock_completion
):
    """An out-of-enum phase argument from the LLM is rejected by the tool's
    pydantic schema (derived from the `Literal` type) before change_phase's
    body runs. ToolNode's default handle_tool_errors converts that
    ValidationError into a recoverable error ToolMessage and the run
    completes with a final AI message -- it does not fail the run.
    """
    from openai.types.chat.chat_completion_message_tool_call import (
        ChatCompletionMessageToolCall,
        Function,
    )

    from tests.conftest import CompletionMeta, make_completion_response

    mock_completion.side_effect = [
        make_completion_response(
            tool_calls=[
                ChatCompletionMessageToolCall(
                    id="call_phase_bad",
                    type="function",
                    function=Function(
                        name="change_phase",
                        arguments='{"phase": "bogus_phase"}',
                    ),
                )
            ],
            meta=CompletionMeta(
                response_id="chatcmpl-test-1", finish_reason="tool_calls"
            ),
        ),
        make_completion_response(
            message_content="Sorry, that is not a valid phase.",
            meta=CompletionMeta(
                response_id="chatcmpl-test-2",
                created=1234567891,
            ),
        ),
    ]

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Please switch to bogus_phase")]},
        thread_config,
    )

    tool_messages = [m for m in result["messages"] if isinstance(m, ToolMessage)]
    assert any(getattr(m, "status", None) == "error" for m in tool_messages)
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    assert any(m.content == "Sorry, that is not a valid phase." for m in ai_messages)
    # Phase is untouched -- defaulted by the phase_gate middleware.
    assert result["phase"] == "research"


@pytest.mark.asyncio
async def test_phase_only_submit_after_failed_generation_skips_llm(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """A state-only submit must not re-invoke the LLM even when the last
    committed checkpoint message is a dangling HumanMessage left by a prior
    generation that was cancelled or failed before the agent replied.

    The phase_gate middleware can't tell that dangling HumanMessage apart from
    a genuine new chat submission by looking at accumulated state alone -- both
    end with `messages[-1]` being a HumanMessage. The frontend's `field.set()`
    marks a state-only submit explicitly via the `state_only_submit` run
    config (see stateSync.svelte.ts), which this test also sets.
    """
    mock_completion = mock_completion_optional

    # First run: the model backend fails, simulating a cancelled/failed
    # generation. The human message + phase write is committed as its own
    # checkpoint superstep; the model call never completes.
    # A non-transport error: httpx transport errors (e.g. ReadTimeout) are
    # retried with long backoff by both the openai SDK and the openrouter SDK
    # (provider_case3), turning this test into a multi-minute retry storm.
    mock_completion.mock(side_effect=RuntimeError("simulated cancellation"))

    with pytest.raises(Exception):  # noqa: B017 - any failure from the mocked call
        await agent.ainvoke(
            {"messages": [HumanMessage(content="Hello there")]},
            thread_config,
        )

    state = await agent.aget_state(thread_config)
    assert isinstance(state.values["messages"][-1], HumanMessage), (
        "Expected the dangling HumanMessage to be committed even though "
        "generation failed"
    )
    call_count_after_failure = mock_completion.call_count
    assert call_count_after_failure >= 1

    # Second run: a phase-only submit carrying the state_only_submit marker.
    # The LLM endpoint must not be hit again.
    state_only_config = RunnableConfig(
        configurable={
            **thread_config.get("configurable", {}),
            "state_only_submit": True,
        }
    )
    result = await agent.ainvoke({"phase": "draft"}, state_only_config)

    assert result["phase"] == "draft"
    ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
    assert len(ai_messages) == 0
    assert mock_completion.call_count == call_count_after_failure


@pytest.mark.asyncio
async def test_phase_only_submit_without_marker_still_regenerates(
    agent, thread_config: RunnableConfig, mock_completion
):
    """Documents the router's default behavior when the state_only_submit
    marker is absent: a submit landing on a checkpoint that ends in a
    HumanMessage still routes to the agent, exactly like the regenerate
    flow. This is what makes the explicit marker in the test above
    necessary rather than incidental.
    """
    mock_completion.side_effect = [
        RuntimeError("First call should fail (simulated cancellation)"),
    ]

    with pytest.raises(Exception):  # noqa: B017 - any failure from the mocked call
        await agent.ainvoke(
            {"messages": [HumanMessage(content="Hello there")]},
            thread_config,
        )
    call_count_after_failure = mock_completion.call_count

    from tests.conftest import make_completion_response

    mock_completion.side_effect = [
        make_completion_response("Regenerated answer"),
    ]

    result = await agent.ainvoke({"phase": "draft"}, thread_config)

    assert result["phase"] == "draft"
    assert mock_completion.call_count == call_count_after_failure + 1, (
        "Without the state_only_submit marker, a submit against a checkpoint "
        "ending in a dangling HumanMessage is expected to route to the agent"
    )


@pytest.mark.asyncio
async def test_invalid_phase_rejected_then_recoverable(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """An invalid phase write raises loudly and keeps raising until a valid
    phase write lands -- then the thread fully recovers.

    Fail-fast is deliberate: the bad value is checkpointed before phase_gate
    runs, so message-only submits keep failing on it, surfacing the caller bug
    instead of silently coercing it away.
    """
    with pytest.raises(ValueError, match="Invalid phase"):
        await agent.ainvoke({"phase": "invalid_phase"}, thread_config)

    # The bad value IS committed to thread state.
    state = await agent.aget_state(thread_config)
    assert state.values["phase"] == "invalid_phase"

    # A message-only submit on the wedged thread also raises, with zero LLM
    # calls.
    with pytest.raises(ValueError, match="Invalid phase"):
        await agent.ainvoke(
            {"messages": [HumanMessage(content="Hello?")]}, thread_config
        )
    assert mock_completion_optional.call_count == 0

    # A valid phase write recovers the thread. It carries the
    # state_only_submit marker (as the frontend's field.set() does) because
    # the failed message submit above left a dangling HumanMessage in the
    # checkpoint, which would otherwise trigger a regenerate.
    state_only_config = RunnableConfig(
        configurable={
            **thread_config.get("configurable", {}),
            "state_only_submit": True,
        }
    )
    result = await agent.ainvoke({"phase": "draft"}, state_only_config)
    assert result["phase"] == "draft"
    assert mock_completion_optional.call_count == 0

    # A full chat turn now works again.
    from tests.conftest import make_completion_response

    mock_completion_optional.side_effect = [
        make_completion_response("Recovered answer"),
    ]
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Still there?")]}, thread_config
    )
    assert mock_completion_optional.call_count == 1
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    assert any(m.content == "Recovered answer" for m in ai_messages)


@pytest.mark.asyncio
async def test_empty_string_phase_rejected(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """An empty-string phase is rejected like any other invalid value, rather
    than silently normalizing to DEFAULT_PHASE.

    `phase=""` is a falsy-but-present value, distinct from a missing phase key
    (see test_state_only_submit_default_phase). phase_gate must only default
    a genuinely absent phase (None), so `""` falls through to the invalid-phase
    branch and raises -- matching the fail-fast contract documented on
    phase_gate.
    """
    with pytest.raises(ValueError, match="Invalid phase"):
        await agent.ainvoke({"phase": ""}, thread_config)

    state = await agent.aget_state(thread_config)
    assert state.values["phase"] == ""
    assert mock_completion_optional.call_count == 0


@pytest.mark.asyncio
async def test_regenerate_reexecutes_model(
    agent, thread_config: RunnableConfig, mock_completion
):
    """Resuming from the checkpoint before an AI answer re-runs the model.

    Mirrors the frontend's regenerate flow: submit no input with the checkpoint
    just before the AI message. With subgraph persistence enabled this would
    replay the cached answer (same id, one model call) instead of regenerating.
    """
    from tests.conftest import CompletionMeta, make_completion_response

    mock_completion.side_effect = [
        make_completion_response(
            "First answer", meta=CompletionMeta(response_id="chatcmpl-first")
        ),
        make_completion_response(
            "Second answer", meta=CompletionMeta(response_id="chatcmpl-second")
        ),
    ]

    result1 = await agent.ainvoke(
        {"messages": [HumanMessage(content="Question")]}, thread_config
    )
    ai1 = [m for m in result1["messages"] if isinstance(m, AIMessage)][-1]
    assert ai1.content == "First answer"

    # Find the checkpoint whose state predates the AI answer (last message is
    # still the human question) — the frontend's `parent_checkpoint`.
    parent = None
    async for snapshot in agent.aget_state_history(thread_config):
        messages = snapshot.values.get("messages", [])
        if messages and isinstance(messages[-1], HumanMessage):
            parent = snapshot
    assert parent is not None

    parent_configurable = parent.config.get("configurable", {})
    regen_config = RunnableConfig(
        configurable={
            **thread_config.get("configurable", {}),
            "checkpoint_id": parent_configurable["checkpoint_id"],
        }
    )
    result2 = await agent.ainvoke(None, regen_config)
    ai2 = [m for m in result2["messages"] if isinstance(m, AIMessage)][-1]

    assert mock_completion.call_count == 2, "regenerate must re-invoke the model"
    assert ai2.id != ai1.id
    assert ai2.content == "Second answer"


def test_phase_enum_single_source_of_truth():
    """VALID_PHASES and DEFAULT_PHASE are derived from the Phase Literal."""
    from typing import get_args

    from svelte_langgraph.phase import DEFAULT_PHASE, VALID_PHASES, Phase

    assert VALID_PHASES == set(get_args(Phase))
    assert DEFAULT_PHASE in VALID_PHASES


def test_phase_in_state_schema(agent):
    """Phase field appears in the graph's input JSON schema with the correct enum values."""
    schema = agent.get_input_jsonschema()
    phase_schema = schema.get("properties", {}).get("phase", {})
    assert "enum" in phase_schema, f"'enum' not found in phase schema: {phase_schema}"
    assert set(phase_schema["enum"]) == {
        "research",
        "draft",
        "review",
    }, f"Unexpected enum values: {phase_schema['enum']}"


def test_prompt_includes_phase_system_message():
    """get_prompt includes a 'Current phase: X' system message at offset 1."""
    from svelte_langgraph.graph import get_prompt

    state = {"messages": [], "phase": "draft"}  # type: ignore[typeddict-item]
    config = RunnableConfig(configurable={"user_name": "Alice", "thread_id": "test"})

    messages = get_prompt(state, config)  # type: ignore[arg-type]

    assert len(messages) >= 2, f"Expected at least 2 messages, got {len(messages)}"
    phase_msg = messages[1]
    assert isinstance(phase_msg, SystemMessage)
    assert phase_msg.content == "Current phase: draft", (
        f"Expected 'Current phase: draft', got {phase_msg.content!r}"
    )
