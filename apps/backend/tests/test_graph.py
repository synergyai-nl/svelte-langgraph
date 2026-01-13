"""Unit tests for the LangGraph agent graph.

This module contains tests for the LangGraph agent, covering:
- Basic conversation flow
- State maintenance across invocations
- Tool invocation and execution
- Tool output verification

Tests are parametrized across multiple OpenAI-compatible providers and models
to ensure provider flexibility and model configuration works correctly.
"""

import httpx
import pytest
import respx
from langchain_core.runnables import RunnableConfig

from svelte_langgraph.graph import get_weather, make_graph

from .conftest import (
    BASE_URLS,
    MODEL_NAMES,
    create_chat_completion,
    create_tool_call,
)


class TestBasicConversation:
    """Tests for basic conversation functionality.

    These tests verify that the agent can receive user messages and
    return appropriate AI responses.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize("base_url", BASE_URLS)
    @pytest.mark.parametrize("model_name", MODEL_NAMES)
    async def test_agent_returns_ai_response(
        self,
        base_url: str,
        model_name: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that the agent receives a user message and returns an AI response.

        This test verifies the basic conversation flow where a user sends a message
        and the agent responds with an appropriate AI-generated response.

        Args:
            base_url: The OpenAI-compatible API base URL to test against.
            model_name: The model name to use for the test.
            monkeypatch: Pytest fixture for setting environment variables.
        """
        monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
        monkeypatch.setenv("OPENAI_BASE_URL", base_url)
        monkeypatch.setenv("CHAT_MODEL_NAME", model_name)

        config: RunnableConfig = {
            "configurable": {"thread_id": "test-thread-1", "user_name": "TestUser"}
        }

        with respx.mock:
            respx.post(f"{base_url}/chat/completions").mock(
                return_value=httpx.Response(
                    200,
                    json=create_chat_completion(
                        content="Hello TestUser! I'm doing great, thank you for asking. How can I help you today?"
                    ).model_dump(),
                )
            )

            agent = make_graph(config)
            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": "Hello, how are you?"}]},
                config,
            )

        assert "messages" in result, "Result should contain messages"
        messages = result["messages"]
        assert len(messages) >= 1, "Should have at least one message"

        ai_messages = [m for m in messages if m.type == "ai"]
        assert len(ai_messages) >= 1, "Should have at least one AI message"
        assert ai_messages[-1].content is not None, "AI message should have content"
        assert len(ai_messages[-1].content) > 0, (
            "AI message content should not be empty"
        )


class TestStateMaintenace:
    """Tests for conversation state maintenance.

    These tests verify that the agent maintains conversation history
    across multiple invocations within the same thread.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize("base_url", BASE_URLS)
    @pytest.mark.parametrize("model_name", MODEL_NAMES)
    async def test_conversation_history_preserved(
        self,
        base_url: str,
        model_name: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that conversation history is preserved across multiple invocations.

        This test verifies that the agent maintains state between invocations,
        allowing for context-aware responses in multi-turn conversations.

        Args:
            base_url: The OpenAI-compatible API base URL to test against.
            model_name: The model name to use for the test.
            monkeypatch: Pytest fixture for setting environment variables.
        """
        monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
        monkeypatch.setenv("OPENAI_BASE_URL", base_url)
        monkeypatch.setenv("CHAT_MODEL_NAME", model_name)

        config: RunnableConfig = {
            "configurable": {"thread_id": "test-thread-state", "user_name": "TestUser"}
        }

        with respx.mock:
            respx.post(f"{base_url}/chat/completions").mock(
                side_effect=[
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Hello TestUser! Nice to meet you. My name is Assistant."
                        ).model_dump(),
                    ),
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Your name is TestUser, as you mentioned earlier!"
                        ).model_dump(),
                    ),
                ]
            )

            agent = make_graph(config)

            result1 = await agent.ainvoke(
                {"messages": [{"role": "user", "content": "Hi, my name is TestUser"}]},
                config,
            )

            result2 = await agent.ainvoke(
                {"messages": [{"role": "user", "content": "What is my name?"}]},
                config,
            )

        assert "messages" in result1, "First result should contain messages"
        assert "messages" in result2, "Second result should contain messages"

        messages1 = result1["messages"]
        messages2 = result2["messages"]

        # Verify message counts
        assert len(messages2) >= 3, "Should have at least 3 messages after two turns"

        user_messages = [m for m in messages2 if m.type == "human"]
        assert len(user_messages) >= 2, (
            "Should have at least 2 user messages in history"
        )

        # Verify content preservation: messages from first invocation should appear in second
        first_user_content = "Hi, my name is TestUser"
        user_contents = [m.content for m in messages2 if m.type == "human"]
        assert first_user_content in user_contents, (
            f"First user message '{first_user_content}' should be preserved in conversation history"
        )

        # Verify the first AI response is preserved
        first_ai_message = next(m for m in messages1 if m.type == "ai")
        ai_contents = [m.content for m in messages2 if m.type == "ai"]
        assert first_ai_message.content in ai_contents, (
            "First AI response should be preserved in conversation history"
        )

        # Verify message ordering: first user message should come before second
        second_user_content = "What is my name?"
        first_user_idx = next(
            i
            for i, m in enumerate(messages2)
            if m.type == "human" and m.content == first_user_content
        )
        second_user_idx = next(
            i
            for i, m in enumerate(messages2)
            if m.type == "human" and m.content == second_user_content
        )
        assert first_user_idx < second_user_idx, (
            "Messages should be in chronological order"
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("base_url", BASE_URLS)
    @pytest.mark.parametrize("model_name", MODEL_NAMES)
    async def test_thread_isolation(
        self,
        base_url: str,
        model_name: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that different threads maintain separate conversation histories.

        This test verifies that conversations in different threads are isolated
        and don't share state or message history.

        Args:
            base_url: The OpenAI-compatible API base URL to test against.
            model_name: The model name to use for the test.
            monkeypatch: Pytest fixture for setting environment variables.
        """
        monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
        monkeypatch.setenv("OPENAI_BASE_URL", base_url)
        monkeypatch.setenv("CHAT_MODEL_NAME", model_name)

        config_thread1: RunnableConfig = {
            "configurable": {
                "thread_id": "test-thread-isolation-1",
                "user_name": "Alice",
            }
        }
        config_thread2: RunnableConfig = {
            "configurable": {"thread_id": "test-thread-isolation-2", "user_name": "Bob"}
        }

        with respx.mock:
            respx.post(f"{base_url}/chat/completions").mock(
                side_effect=[
                    # Thread 1 - First message
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Hello Alice! I'll remember that your favorite color is blue."
                        ).model_dump(),
                    ),
                    # Thread 2 - First message
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Hello Bob! I'll remember that your favorite color is red."
                        ).model_dump(),
                    ),
                    # Thread 1 - Second message
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Your favorite color is blue, Alice!"
                        ).model_dump(),
                    ),
                    # Thread 2 - Second message
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Your favorite color is red, Bob!"
                        ).model_dump(),
                    ),
                ]
            )

            agent1 = make_graph(config_thread1)
            agent2 = make_graph(config_thread2)

            # First invocation in thread 1
            await agent1.ainvoke(
                {
                    "messages": [
                        {"role": "user", "content": "My favorite color is blue"}
                    ]
                },
                config_thread1,
            )

            # First invocation in thread 2
            await agent2.ainvoke(
                {"messages": [{"role": "user", "content": "My favorite color is red"}]},
                config_thread2,
            )

            # Second invocation in thread 1
            result_thread1_turn2 = await agent1.ainvoke(
                {
                    "messages": [
                        {"role": "user", "content": "What is my favorite color?"}
                    ]
                },
                config_thread1,
            )

            # Second invocation in thread 2
            result_thread2_turn2 = await agent2.ainvoke(
                {
                    "messages": [
                        {"role": "user", "content": "What is my favorite color?"}
                    ]
                },
                config_thread2,
            )

        # Verify thread 1 contains only its own messages
        messages_t1 = result_thread1_turn2["messages"]
        t1_contents = " ".join(m.content for m in messages_t1 if m.content)
        assert "blue" in t1_contents.lower(), (
            "Thread 1 should contain its own conversation about blue"
        )
        assert "red" not in t1_contents.lower(), (
            "Thread 1 should not contain messages from thread 2 about red"
        )

        # Verify thread 2 contains only its own messages
        messages_t2 = result_thread2_turn2["messages"]
        t2_contents = " ".join(m.content for m in messages_t2 if m.content)
        assert "red" in t2_contents.lower(), (
            "Thread 2 should contain its own conversation about red"
        )
        assert "blue" not in t2_contents.lower(), (
            "Thread 2 should not contain messages from thread 1 about blue"
        )

        # Verify thread 1 has exactly 4 messages (2 user + 2 AI)
        t1_user_messages = [m for m in messages_t1 if m.type == "human"]
        t1_ai_messages = [m for m in messages_t1 if m.type == "ai"]
        assert len(t1_user_messages) == 2, (
            "Thread 1 should have exactly 2 user messages"
        )
        assert len(t1_ai_messages) == 2, "Thread 1 should have exactly 2 AI messages"

        # Verify thread 2 has exactly 4 messages (2 user + 2 AI)
        t2_user_messages = [m for m in messages_t2 if m.type == "human"]
        t2_ai_messages = [m for m in messages_t2 if m.type == "ai"]
        assert len(t2_user_messages) == 2, (
            "Thread 2 should have exactly 2 user messages"
        )
        assert len(t2_ai_messages) == 2, "Thread 2 should have exactly 2 AI messages"


class TestToolInvocation:
    """Tests for tool invocation functionality.

    These tests verify that the agent correctly recognizes when to call tools,
    executes them, and incorporates the results into its response.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize("base_url", BASE_URLS)
    @pytest.mark.parametrize("model_name", MODEL_NAMES)
    async def test_agent_calls_weather_tool(
        self,
        base_url: str,
        model_name: str,
        monkeypatch: pytest.MonkeyPatch,
        deterministic_weather: None,
    ) -> None:
        """Test that the agent recognizes when to call the get_weather tool.

        This test verifies that when a user asks about weather, the agent
        correctly invokes the get_weather tool and incorporates the result
        into its response.

        Args:
            base_url: The OpenAI-compatible API base URL to test against.
            model_name: The model name to use for the test.
            monkeypatch: Pytest fixture for setting environment variables.
            deterministic_weather: Fixture that mocks asyncio.sleep for fast tests.
        """
        monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
        monkeypatch.setenv("OPENAI_BASE_URL", base_url)
        monkeypatch.setenv("CHAT_MODEL_NAME", model_name)

        config: RunnableConfig = {
            "configurable": {"thread_id": "test-thread-tool", "user_name": "TestUser"}
        }

        with respx.mock:
            respx.post(f"{base_url}/chat/completions").mock(
                side_effect=[
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content=None,
                            tool_calls=[
                                create_tool_call("get_weather", {"city": "Paris"})
                            ],
                            finish_reason="tool_calls",
                        ).model_dump(),
                    ),
                    httpx.Response(
                        200,
                        json=create_chat_completion(
                            content="Based on the weather information, it's always sunny in Paris! "
                            "It looks like a great day to go outside."
                        ).model_dump(),
                    ),
                ]
            )

            agent = make_graph(config)
            result = await agent.ainvoke(
                {
                    "messages": [
                        {"role": "user", "content": "What's the weather like in Paris?"}
                    ]
                },
                config,
            )

        assert "messages" in result, "Result should contain messages"
        messages = result["messages"]

        # Verify the AI message contains a tool call with correct function name and arguments
        ai_messages_with_tool_calls = [
            m for m in messages if m.type == "ai" and m.tool_calls
        ]
        assert len(ai_messages_with_tool_calls) >= 1, (
            "Should have at least one AI message with tool calls"
        )

        tool_call = ai_messages_with_tool_calls[0].tool_calls[0]
        assert tool_call["name"] == "get_weather", (
            f"Tool call function name should be 'get_weather', got '{tool_call['name']}'"
        )
        assert "city" in tool_call["args"], "Tool call should have 'city' argument"
        assert tool_call["args"]["city"] == "Paris", (
            f"Tool call city argument should be 'Paris', got '{tool_call['args']['city']}'"
        )

        # Verify tool message exists with the tool output
        tool_messages = [m for m in messages if m.type == "tool"]
        assert len(tool_messages) >= 1, "Should have at least one tool message"
        assert "sunny" in tool_messages[0].content.lower(), (
            "Tool message should contain weather information"
        )

        # Verify final AI response incorporates the tool result
        ai_messages = [m for m in messages if m.type == "ai"]
        assert len(ai_messages) >= 1, "Should have at least one AI message"
        final_response = ai_messages[-1].content
        assert final_response is not None, "Final AI response should have content"
        assert "sunny" in final_response.lower() or "paris" in final_response.lower(), (
            "Response should mention weather or Paris"
        )


class TestToolOutput:
    """Tests for tool output verification.

    These tests verify that the get_weather tool returns the expected
    format and content.
    """

    @pytest.mark.asyncio
    async def test_weather_tool_returns_expected_format(
        self,
        deterministic_weather: None,
    ) -> None:
        """Test that the get_weather tool returns the expected format and content.

        This test verifies that the tool returns a string in the expected format
        containing the city name.

        Args:
            deterministic_weather: Fixture that mocks asyncio.sleep for fast tests.
        """
        result = await get_weather("London")

        assert isinstance(result, str), "Result should be a string"
        assert "London" in result, "Result should contain the city name"
        assert "sunny" in result.lower(), "Result should mention sunny weather"

    @pytest.mark.asyncio
    async def test_weather_tool_works_for_various_cities(
        self,
        deterministic_weather: None,
    ) -> None:
        """Test that the get_weather tool works correctly for various cities.

        Args:
            deterministic_weather: Fixture that mocks asyncio.sleep for fast tests.
        """
        cities = ["New York", "Tokyo", "Berlin", "Sydney"]

        for city in cities:
            result = await get_weather(city)
            assert isinstance(result, str), f"Result for {city} should be a string"
            assert city in result, f"Result should contain {city}"
            assert "sunny" in result.lower(), f"Result for {city} should mention sunny"

    @pytest.mark.asyncio
    async def test_weather_tool_output_is_deterministic(
        self,
        deterministic_weather: None,
    ) -> None:
        """Test that the tool output is deterministic (same city = same output).

        Args:
            deterministic_weather: Fixture that mocks asyncio.sleep for fast tests.
        """
        result1 = await get_weather("Paris")
        result2 = await get_weather("Paris")

        assert result1 == result2, "Same city should produce same output"
        assert result1 == "It's always sunny in Paris!", (
            "Output should match expected format"
        )
