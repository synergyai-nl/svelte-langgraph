"""Pytest configuration and fixtures for LangGraph tests."""

from uuid import uuid4

import pytest
import pytest_asyncio
import respx
from httpx import Response
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field
from src.svelte_langgraph.graph import make_graph

OPENAI_TEST_BASE_URL = "https://api.openai.test"


@pytest.fixture
def mock_completion():
    """Mock OpenAI API endpoint."""
    with respx.mock(base_url="https://api.openai.test") as respx_mock:
        yield respx_mock.post("/chat/completions")


@pytest.fixture(scope="function", autouse=True)
def env_setup(monkeypatch):
    """Set up environment variables for testing."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENAI_BASE_URL", OPENAI_TEST_BASE_URL)
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("CHAT_MODEL_TEMPERATURE", "0")


class Function(BaseModel):
    name: str
    arguments: str


class ToolCall(BaseModel):
    call_id: str = Field(serialization_alias="id")
    type: str = "function"
    function: Function


def make_message(content: str | None = None, tool_calls: list[ToolCall] = []) -> dict:
    """Create a message structure."""
    message: dict = {"role": "assistant"}
    message["content"] = content
    message["tool_calls"] = [call.model_dump(by_alias=True) for call in tool_calls]

    return message


def make_completion_response(
    message: dict,
    finish_reason: str = "stop",
    response_id: str = "chatcmpl-test",
    created: int = 1234567890,
    model: str = "gpt-4o-mini",
    usage: dict | None = None,
) -> dict:
    """Create a complete OpenAI API response."""
    if usage is None:
        usage = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}

    choices = [{"index": 0, "message": message, "finish_reason": finish_reason}]

    resposne_json = {
        "id": response_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": choices,
        "usage": usage,
    }

    return Response(200, json=resposne_json)


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
    mock_completion.mock(
        return_value=make_completion_response(
            message=make_message(
                content="Hello! I'm doing great, thanks for asking. How can I help you today?"
            )
        ),
    )
    yield mock_completion


@pytest.fixture
def openai_single_tool_call(mock_completion):
    """Mock OpenAI API for single tool call scenario."""
    mock_completion.side_effect = [
        make_completion_response(
            response_id="chatcmpl-test-1",
            message=make_message(
                tool_calls=[
                    ToolCall(
                        call_id="call_1",
                        function={
                            "name": "get_weather",
                            "arguments": '{"city": "Paris"}',
                        },
                    )
                ]
            ),
            finish_reason="tool_calls",
        ),
        make_completion_response(
            response_id="chatcmpl-test-2",
            created=1234567891,
            message=make_message(
                content="Based on the weather information, it's always sunny in Paris! Perfect weather for sightseeing."
            ),
            usage={
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40,
            },
        ),
    ]

    yield mock_completion


@pytest.fixture
def openai_parallel_tool_calls(mock_completion):
    """Mock OpenAI API for parallel tool calls scenario."""
    mock_completion.side_effect = [
        make_completion_response(
            response_id="chatcmpl-test-1",
            message=make_message(
                tool_calls=[
                    ToolCall(
                        call_id="call_1",
                        function={
                            "name": "get_weather",
                            "arguments": '{"city": "Paris"}',
                        },
                    ),
                    ToolCall(
                        call_id="call_2",
                        function={
                            "name": "get_time",
                            "arguments": '{"city": "Paris"}',
                        },
                    ),
                ]
            ),
            finish_reason="tool_calls",
        ),
        make_completion_response(
            response_id="chatcmpl-test-2",
            created=1234567891,
            message=make_message(
                content="In Paris, it's always sunny and the time is 14:30! Great time to visit the Eiffel Tower."
            ),
            usage={
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40,
            },
        ),
    ]
    yield mock_completion
