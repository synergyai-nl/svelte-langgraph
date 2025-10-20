"""Tests for the LangGraph agent graph module."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from unittest.mock import patch

from src.svelte_langgraph.graph import make_graph, get_weather


def get_time(city: str) -> str:
    """Test tool for getting time in a city."""
    return f"The time in {city} is 14:30"


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
    agent, thread_config: RunnableConfig, openai_single_tool_call
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

    for i, msg in enumerate(messages[1:], start=1):
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
    agent, thread_config: RunnableConfig, openai_single_tool_call
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
async def test_parallel_tool_calls(
    thread_config: RunnableConfig, openai_parallel_tool_calls
):
    """Test parallel tool calls with multiple tools invoked simultaneously.

    This test verifies:
    1. The agent can invoke multiple tools in parallel
    2. Both tools are called with correct arguments
    3. Both tool responses are processed
    4. The agent generates a final response incorporating both tool outputs
    """
    with patch("src.svelte_langgraph.graph.create_agent") as mock_create_agent:
        try:
            from langchain.agents import create_agent as real_create_agent
        except ImportError:
            from langgraph.prebuilt import create_react_agent as real_create_agent

        def create_agent_with_extra_tools(*args, **kwargs):
            kwargs["tools"] = [get_weather, get_time]
            return real_create_agent(*args, **kwargs)

        mock_create_agent.side_effect = create_agent_with_extra_tools

        agent = make_graph(thread_config)

        user_message = "What's the weather and time in Paris?"

        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=user_message)]},
            thread_config,
        )

        assert "messages" in result
        messages = result["messages"]

        user_msg = messages[0]
        assert isinstance(user_msg, HumanMessage)
        assert user_msg.content == user_message

        tool_call_message = None
        tool_messages = []
        final_ai_response = None

        for msg in messages[1:]:
            if (
                isinstance(msg, AIMessage)
                and hasattr(msg, "tool_calls")
                and msg.tool_calls
            ):
                tool_call_message = msg
            elif isinstance(msg, ToolMessage):
                tool_messages.append(msg)
            elif (
                isinstance(msg, AIMessage)
                and msg.content
                and not (hasattr(msg, "tool_calls") and msg.tool_calls)
            ):
                final_ai_response = msg

        assert tool_call_message is not None, "No tool call message found"
        assert len(tool_call_message.tool_calls) >= 2, (
            f"Expected at least 2 parallel tool calls, got {len(tool_call_message.tool_calls)}"
        )

        tool_names = [tc["name"] for tc in tool_call_message.tool_calls]
        assert "get_weather" in tool_names, "get_weather tool not called"
        assert "get_time" in tool_names, "get_time tool not called"

        for tool_call in tool_call_message.tool_calls:
            assert "city" in tool_call["args"]
            assert tool_call["args"]["city"] == "Paris"

        assert len(tool_messages) >= 2, (
            f"Expected at least 2 tool response messages, got {len(tool_messages)}"
        )

        tool_response_names = [msg.name for msg in tool_messages]
        assert "get_weather" in tool_response_names, "get_weather response not found"
        assert "get_time" in tool_response_names, "get_time response not found"

        weather_msg = next(msg for msg in tool_messages if msg.name == "get_weather")
        assert "sunny" in weather_msg.content.lower() or "Paris" in weather_msg.content

        time_msg = next(msg for msg in tool_messages if msg.name == "get_time")
        assert "14:30" in time_msg.content or "time" in time_msg.content.lower()

        assert final_ai_response is not None, "No final AI response found"
        assert len(final_ai_response.content) > 0


@pytest.mark.asyncio
async def test_parallel_tools_execution_order(
    thread_config: RunnableConfig, openai_parallel_tool_calls
):
    """Test that parallel tool calls are executed and responses are properly ordered.

    This test verifies:
    1. Multiple tools can be invoked in a single agent turn
    2. Tool responses are collected before generating final response
    3. The conversation flow is correct
    """
    with patch("src.svelte_langgraph.graph.create_agent") as mock_create_agent:
        try:
            from langchain.agents import create_agent as real_create_agent
        except ImportError:
            from langgraph.prebuilt import create_react_agent as real_create_agent

        def create_agent_with_extra_tools(*args, **kwargs):
            kwargs["tools"] = [get_weather, get_time]
            return real_create_agent(*args, **kwargs)

        mock_create_agent.side_effect = create_agent_with_extra_tools

        agent = make_graph(thread_config)

        user_message = "Tell me about Paris weather and time"

        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=user_message)]},
            thread_config,
        )

        messages = result["messages"]

        message_types = []
        for msg in messages:
            if (
                isinstance(msg, AIMessage)
                and hasattr(msg, "tool_calls")
                and msg.tool_calls
            ):
                message_types.append("ai_with_tools")
            elif isinstance(msg, ToolMessage):
                message_types.append("tool")
            elif isinstance(msg, AIMessage):
                message_types.append("ai")
            elif isinstance(msg, HumanMessage):
                message_types.append("human")

        assert "human" in message_types
        assert message_types[0] == "human"
        assert "ai_with_tools" in message_types

        tool_call_index = message_types.index("ai_with_tools")

        tool_indices = [i for i, t in enumerate(message_types) if t == "tool"]
        assert len(tool_indices) >= 2, "Expected at least 2 tool messages"

        for tool_idx in tool_indices:
            assert tool_idx > tool_call_index, (
                "Tool messages should come after tool call message"
            )

        final_ai_indices = [
            i for i, t in enumerate(message_types) if t == "ai" and i > tool_call_index
        ]
        assert len(final_ai_indices) >= 1, "Expected final AI response after tool calls"

        final_ai_index = final_ai_indices[0]
        for tool_idx in tool_indices:
            assert tool_idx < final_ai_index, (
                "All tool messages should come before final AI response"
            )
