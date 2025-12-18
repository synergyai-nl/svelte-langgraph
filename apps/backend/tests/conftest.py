"""Pytest configuration and fixtures for LangGraph tests."""

from typing import Literal
from uuid import uuid4

import pytest
import pytest_asyncio
import respx
from httpx import Response
from langchain_core.runnables import RunnableConfig
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
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


@pytest.fixture
def deterministic_weather(monkeypatch):
    """Patch get_weather to be fast and deterministic.

    Main's get_weather is async with random sleep, so we need to mock it
    to make tests fast and deterministic.
    """

    async def fast_get_weather(city: str) -> str:
        return f"It's always sunny in {city}!"

    monkeypatch.setattr("svelte_langgraph.graph.get_weather", fast_get_weather)


class Function(BaseModel):
    name: str
    arguments: str


class ToolCall(BaseModel):
    call_id: str = Field(serialization_alias="id")
    type: str = "function"
    function: Function

    model_config = ConfigDict(serialize_by_alias=True)


class Message(BaseModel):
    role: str = "assistant"
    content: str | None = None
    tool_calls: list[ToolCall] = []


FinishReason = Literal["stop", "tool_calls"]


class Choice(BaseModel):
    index: int = 0
    message: Message
    finish_reason: FinishReason


class ResponseJSON(BaseModel):
    response_id: str = Field(serialization_alias="id")
    object_type: str = Field(serialization_alias="object")
    created: int
    model: str = "gpt-4o-mini"
    choices: list[Choice]
    usage: dict

    model_config = ConfigDict(serialize_by_alias=True)


class CompletionResponse(Response):
    def __init__(self, status_code: int, json: ResponseJSON) -> None:
        super().__init__(status_code, json=json.model_dump())


def make_completion_response(
    message_content: str | None = None,
    finish_reason: FinishReason = "stop",
    response_id: str = "chatcmpl-test",
    tool_calls: list[ToolCall] | None = None,
    created: int = 1234567890,
    usage: dict | None = None,
):
    """Create OpenAI API response."""
    if tool_calls is None:
        tool_calls = []
    if usage is None:
        usage = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}

    message = Message(content=message_content, tool_calls=tool_calls)
    choices = [Choice(message=message, finish_reason=finish_reason)]

    response = CompletionResponse(
        200,
        json=ResponseJSON(
            response_id=response_id,
            object_type="chat.completion",
            choices=choices,
            created=created,
            usage=usage,
        ),
    )

    return response


@pytest.fixture
def thread_config() -> RunnableConfig:
    """Create a unique thread configuration for each test."""
    return RunnableConfig(
        configurable={"thread_id": str(uuid4()), "user_name": "Alice"}
    )


@pytest_asyncio.fixture
async def agent(thread_config: RunnableConfig):
    """Create a LangGraph agent for testing."""
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
                ToolCall(
                    call_id="call_1",
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
            usage={
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40,
            },
        ),
    ]

    yield mock_completion
