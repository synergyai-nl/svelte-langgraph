"""Shared test fixtures for LangGraph agent tests.

This module provides fixtures for mocking OpenAI API responses across different
providers (OpenAI, OpenRouter, Ollama) and models. It uses official OpenAI SDK
types to ensure type compatibility with the actual API schema.
"""

import json
from collections.abc import Generator
from typing import Any, Literal
from unittest.mock import AsyncMock, patch

import pytest
import respx
from openai.types import CompletionUsage
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.chat.chat_completion_message_function_tool_call import (
    ChatCompletionMessageFunctionToolCall,
    Function,
)

OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OLLAMA_BASE_URL = "http://localhost:11434/v1"

BASE_URLS = [OPENAI_BASE_URL, OPENROUTER_BASE_URL, OLLAMA_BASE_URL]
MODEL_NAMES = ["gpt-4o-mini", "gpt-4o", "openai/gpt-4o-mini", "llama3.2"]


def create_chat_completion(
    content: str | None = None,
    tool_calls: list[ChatCompletionMessageFunctionToolCall] | None = None,
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter"] = "stop",
) -> ChatCompletion:
    """Create a ChatCompletion response using official OpenAI SDK types.

    Args:
        content: The text content of the assistant's response.
        tool_calls: Optional list of tool calls the assistant wants to make.
        finish_reason: The reason the model stopped generating (stop, tool_calls, etc).

    Returns:
        A ChatCompletion object matching the OpenAI API schema.
    """
    message = ChatCompletionMessage.model_construct(
        role="assistant",
        content=content,
        tool_calls=tool_calls,
    )

    choice = Choice.model_construct(
        index=0,
        message=message,
        finish_reason=finish_reason,
    )

    return ChatCompletion(
        id="chatcmpl-test123",
        object="chat.completion",
        created=1700000000,
        model="gpt-4o-mini",
        choices=[choice],
        usage=CompletionUsage(
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
        ),
    )


def create_tool_call(
    tool_name: str, arguments: dict[str, Any]
) -> ChatCompletionMessageFunctionToolCall:
    """Create a tool call using official OpenAI SDK types.

    Args:
        tool_name: The name of the tool to call.
        arguments: The arguments to pass to the tool as a dictionary.

    Returns:
        A ChatCompletionMessageFunctionToolCall object matching the OpenAI API schema.
    """
    return ChatCompletionMessageFunctionToolCall(
        id=f"call_{tool_name}_123",
        type="function",
        function=Function(
            name=tool_name,
            arguments=json.dumps(arguments),
        ),
    )


@pytest.fixture
def mock_env_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set up environment variables for testing.

    This fixture uses monkeypatch.setenv() to ensure tests don't depend on
    the actual environment. It sets default values that can be overridden
    by parametrized tests.
    """
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENAI_BASE_URL", OPENAI_BASE_URL)
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")


@pytest.fixture
def deterministic_weather() -> Generator[AsyncMock, None, None]:
    """Mock the get_weather tool to return immediately with predictable output.

    The production get_weather function has a random sleep for realism.
    This fixture patches asyncio.sleep to make tests fast and deterministic
    while still executing the actual tool logic.
    """
    with patch(
        "svelte_langgraph.graph.asyncio.sleep", new_callable=AsyncMock
    ) as mock_sleep:
        mock_sleep.return_value = None
        yield mock_sleep


@pytest.fixture
def mock_openai_api() -> Generator[respx.MockRouter, None, None]:
    """Mock OpenAI API responses using respx.

    This fixture sets up respx to intercept HTTP requests to OpenAI-compatible
    APIs.

    The fixture expects test functions to configure the mock responses
    using the returned router.
    """
    with respx.mock as router:
        yield router


@pytest.fixture(params=BASE_URLS)
def base_url(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> str:
    """Parametrized fixture providing different OpenAI-compatible base URLs.

    This fixture runs tests against multiple providers:
    - OpenAI (https://api.openai.com/v1)
    - OpenRouter (https://openrouter.ai/api/v1)
    - Ollama (http://localhost:11434/v1)
    """
    url: str = request.param
    monkeypatch.setenv("OPENAI_BASE_URL", url)
    return url


@pytest.fixture(params=MODEL_NAMES)
def model_name(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> str:
    """Parametrized fixture providing different model names.

    This fixture runs tests against multiple models to ensure model
    configuration works correctly.
    """
    name: str = request.param
    monkeypatch.setenv("CHAT_MODEL_NAME", name)
    return name


@pytest.fixture
async def runnable_config() -> dict[str, Any]:
    """Create a RunnableConfig for testing.

    Returns a configuration dictionary with a test thread ID and user name
    for use with the LangGraph agent.
    """
    return {"configurable": {"thread_id": "test-thread-1", "user_name": "TestUser"}}
