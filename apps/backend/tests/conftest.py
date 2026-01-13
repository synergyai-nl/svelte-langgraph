"""Pytest configuration and fixtures for LangGraph tests."""

from collections.abc import Sequence
from typing import Literal
from uuid import uuid4

import pytest
import pytest_asyncio
import respx
from httpx import Response
from langchain_core.runnables import RunnableConfig
from openai.types import CompletionUsage
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    ChatCompletionMessageToolCallUnion,
    Function,
)

from svelte_langgraph.graph import make_graph

DEFAULT_BASE_URL = "https://api.openai.com/v1"


@pytest.fixture(
    params=[None, "https://openrouter.ai/api/v1", "http://localhost:11434/v1"],
    scope="module",
)
def openai_base_url(request):
    yield request.param


@pytest.fixture
def mock_completion(openai_base_url):
    """Mock OpenAI API endpoint."""

    actual_base_url = openai_base_url
    if not actual_base_url:
        actual_base_url = DEFAULT_BASE_URL

    with respx.mock(base_url=actual_base_url) as respx_mock:
        yield respx_mock.post("/chat/completions")


@pytest.fixture(
    params=[None, "claude-3-5-sonnet-latest", "gpt-4o-mini", "something-else-entirely"],
)
def chat_model(request):
    yield request.param


@pytest.fixture(
    scope="function",
    autouse=True,
)
def env_setup(monkeypatch, openai_base_url, chat_model):
    """Set up environment variables for testing."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")

    if openai_base_url:
        monkeypatch.setenv("OPENAI_BASE_URL", openai_base_url)

    if chat_model:
        monkeypatch.setenv("CHAT_MODEL_NAME", chat_model)


async def get_weather(city: str) -> str:
    """Fast, deterministic mock for get_weather.

    The real get_weather has a random 1-10 second sleep, so we use this
    mock to make tests fast and deterministic.
    """
    return f"It's always sunny in {city}!"


FinishReason = Literal["stop", "tool_calls"]


class CompletionResponse(Response):
    def __init__(self, status_code: int, completion: ChatCompletion) -> None:
        super().__init__(status_code, json=completion.model_dump())


def make_completion_response(
    message_content: str | None = None,
    finish_reason: FinishReason = "stop",
    response_id: str = "chatcmpl-test",
    tool_calls: Sequence[ChatCompletionMessageToolCallUnion] | None = None,
    created: int = 1234567890,
    usage: CompletionUsage | None = None,
):
    """Create OpenAI API response using OpenAI SDK types."""
    if usage is None:
        usage = CompletionUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30)

    message = ChatCompletionMessage(
        role="assistant",
        content=message_content,
        tool_calls=list(tool_calls) if tool_calls else None,
    )
    choice = Choice(
        index=0,
        message=message,
        finish_reason=finish_reason,
        logprobs=None,
    )

    completion = ChatCompletion(
        id=response_id,
        object="chat.completion",
        created=created,
        model="gpt-4o-mini",
        choices=[choice],
        usage=usage,
    )

    return CompletionResponse(200, completion=completion)


@pytest.fixture
def thread_config() -> RunnableConfig:
    """Create a unique thread configuration for each test."""
    return RunnableConfig(
        configurable={"thread_id": str(uuid4()), "user_name": "Alice"}
    )


@pytest_asyncio.fixture
async def agent(thread_config: RunnableConfig):
    """Create a LangGraph agent for testing.

    Uses the local get_weather mock instead of the real get_weather to avoid
    the random 1-10 second sleep in the real implementation.
    """
    thread_config["configurable"]["weather_tool"] = get_weather
    return make_graph(thread_config)


@pytest.fixture
def openai_basic_conversation(mock_completion):
    """Mock OpenAI API for basic conversation without tool calls."""
    response = make_completion_response(
        "Hello! I'm doing great, thanks for asking. How can I help you today?"
    )
    mock_completion.mock(return_value=response)
    yield mock_completion


@pytest.fixture
def openai_single_tool_call(mock_completion):
    """Mock OpenAI API for single tool call scenario."""
    mock_completion.side_effect = [
        make_completion_response(
            response_id="chatcmpl-test-1",
            tool_calls=[
                ChatCompletionMessageToolCall(
                    id="call_1",
                    type="function",
                    function=Function(
                        name="get_weather",
                        arguments='{"city": "Paris"}',
                    ),
                )
            ],
            finish_reason="tool_calls",
        ),
        make_completion_response(
            response_id="chatcmpl-test-2",
            created=1234567891,
            message_content="Based on the weather information, it's always sunny in Paris! Perfect weather for sightseeing.",
            usage=CompletionUsage(
                prompt_tokens=15,
                completion_tokens=25,
                total_tokens=40,
            ),
        ),
    ]

    yield mock_completion
