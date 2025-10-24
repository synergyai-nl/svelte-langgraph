"""Pytest configuration and fixtures for LangGraph tests."""

from uuid import uuid4

import pytest
import pytest_asyncio
import respx
from httpx import Response
from langchain_core.runnables import RunnableConfig
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


def make_tool_call(name: str, arguments: str, call_id: str) -> dict:
    """Create a tool call structure."""
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": arguments},
    }


def make_message(
    content: str | None = None, tool_calls: list[dict] | None = None
) -> dict:
    """Create a message structure."""
    message: dict = {"role": "assistant"}
    message["content"] = content
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return message


def make_choice(message: dict, finish_reason: str = "stop") -> dict:
    """Create a choice structure."""
    return {"index": 0, "message": message, "finish_reason": finish_reason}


def make_completion_response(
    choices: list[dict],
    response_id: str = "chatcmpl-test",
    created: int = 1234567890,
    model: str = "gpt-4o-mini",
    usage: dict | None = None,
) -> dict:
    """Create a complete OpenAI API response."""
    if usage is None:
        usage = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
    return {
        "id": response_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": choices,
        "usage": usage,
    }


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
        return_value=Response(
            200,
            json=make_completion_response(
                choices=[
                    make_choice(
                        message=make_message(
                            content="Hello! I'm doing great, thanks for asking. How can I help you today?"
                        )
                    )
                ]
            ),
        )
    )
    yield mock_completion


@pytest.fixture
def openai_single_tool_call(mock_completion):
    """Mock OpenAI API for single tool call scenario."""
    mock_completion.side_effect = [
        Response(
            200,
            json=make_completion_response(
                response_id="chatcmpl-test-1",
                choices=[
                    make_choice(
                        message=make_message(
                            tool_calls=[
                                make_tool_call(
                                    name="get_weather",
                                    arguments='{"city": "Paris"}',
                                    call_id="call_1",
                                )
                            ]
                        ),
                        finish_reason="tool_calls",
                    )
                ],
            ),
        ),
        Response(
            200,
            json=make_completion_response(
                response_id="chatcmpl-test-2",
                created=1234567891,
                choices=[
                    make_choice(
                        message=make_message(
                            content="Based on the weather information, it's always sunny in Paris! Perfect weather for sightseeing."
                        )
                    )
                ],
                usage={
                    "prompt_tokens": 15,
                    "completion_tokens": 25,
                    "total_tokens": 40,
                },
            ),
        ),
    ]

    yield mock_completion


@pytest.fixture
def openai_parallel_tool_calls(mock_completion):
    """Mock OpenAI API for parallel tool calls scenario."""
    mock_completion.side_effect = [
        Response(
            200,
            json=make_completion_response(
                response_id="chatcmpl-test-1",
                choices=[
                    make_choice(
                        message=make_message(
                            tool_calls=[
                                make_tool_call(
                                    name="get_weather",
                                    arguments='{"city": "Paris"}',
                                    call_id="call_1",
                                ),
                                make_tool_call(
                                    name="get_time",
                                    arguments='{"city": "Paris"}',
                                    call_id="call_2",
                                ),
                            ]
                        ),
                        finish_reason="tool_calls",
                    )
                ],
            ),
        ),
        Response(
            200,
            json=make_completion_response(
                response_id="chatcmpl-test-2",
                created=1234567891,
                choices=[
                    make_choice(
                        message=make_message(
                            content="In Paris, it's always sunny and the time is 14:30! Great time to visit the Eiffel Tower."
                        )
                    )
                ],
                usage={
                    "prompt_tokens": 15,
                    "completion_tokens": 25,
                    "total_tokens": 40,
                },
            ),
        ),
    ]
    yield mock_completion
