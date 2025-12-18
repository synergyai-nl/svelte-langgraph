"""Tests for the LangGraph agent graph module."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
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
    deterministic_weather,
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
    deterministic_weather,
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
