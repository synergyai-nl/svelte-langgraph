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
async def test_invalid_phase_coerced(
    agent, thread_config: RunnableConfig, mock_completion_optional
):
    """Router coerces an invalid phase to the default instead of raising.

    Raising would wedge the thread: the input is checkpointed before the entry
    node runs, so the bad value would be committed and every later run would
    fail on it.
    """
    result = await agent.ainvoke({"phase": "invalid_phase"}, thread_config)

    assert result["phase"] == "research"

    # The thread must remain usable afterwards.
    result = await agent.ainvoke({"phase": "draft"}, thread_config)
    assert result["phase"] == "draft"


@pytest.mark.asyncio
async def test_regenerate_reexecutes_model(
    agent, thread_config: RunnableConfig, mock_completion
):
    """Resuming from the checkpoint before an AI answer re-runs the model.

    Mirrors the frontend's regenerate flow: submit no input with the checkpoint
    just before the AI message. With subgraph persistence enabled this would
    replay the cached answer (same id, one model call) instead of regenerating.
    """
    from tests.conftest import make_completion_response

    mock_completion.side_effect = [
        make_completion_response("First answer", response_id="chatcmpl-first"),
        make_completion_response("Second answer", response_id="chatcmpl-second"),
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
