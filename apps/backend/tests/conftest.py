"""Pytest configuration and fixtures for LangGraph tests."""

from uuid import uuid4

import pytest
import pytest_asyncio
import respx
from httpx import Response
from langchain_core.runnables import RunnableConfig

from src.svelte_langgraph.graph import make_graph


@pytest.fixture(scope="function", autouse=True)
def env_setup(monkeypatch):
    """Set up environment variables for testing."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.openai.test")
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("CHAT_MODEL_TEMPERATURE", "0")


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
def openai_basic_conversation():
    """Mock OpenAI API for basic conversation without tool calls."""
    with respx.mock(base_url="https://api.openai.test") as respx_mock:
        respx_mock.post("/chat/completions").mock(
            return_value=Response(
                200,
                json={
                    "id": "chatcmpl-test",
                    "object": "chat.completion",
                    "created": 1234567890,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "Hello! I'm doing great, thanks for asking. How can I help you today?",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "total_tokens": 30,
                    },
                },
            )
        )
        yield respx_mock


@pytest.fixture
def openai_single_tool_call():
    """Mock OpenAI API for single tool call scenario."""
    with respx.mock(base_url="https://api.openai.test") as respx_mock:
        route = respx_mock.post("/chat/completions")

        route.side_effect = [
            Response(
                200,
                json={
                    "id": "chatcmpl-test-1",
                    "object": "chat.completion",
                    "created": 1234567890,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "get_weather",
                                            "arguments": '{"city": "Paris"}',
                                        },
                                    }
                                ],
                            },
                            "finish_reason": "tool_calls",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "total_tokens": 30,
                    },
                },
            ),
            Response(
                200,
                json={
                    "id": "chatcmpl-test-2",
                    "object": "chat.completion",
                    "created": 1234567891,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "Based on the weather information, it's always sunny in Paris! Perfect weather for sightseeing.",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 15,
                        "completion_tokens": 25,
                        "total_tokens": 40,
                    },
                },
            ),
        ]
        yield respx_mock


@pytest.fixture
def openai_parallel_tool_calls():
    """Mock OpenAI API for parallel tool calls scenario."""
    with respx.mock(base_url="https://api.openai.test") as respx_mock:
        route = respx_mock.post("/chat/completions")

        route.side_effect = [
            Response(
                200,
                json={
                    "id": "chatcmpl-test-1",
                    "object": "chat.completion",
                    "created": 1234567890,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "get_weather",
                                            "arguments": '{"city": "Paris"}',
                                        },
                                    },
                                    {
                                        "id": "call_2",
                                        "type": "function",
                                        "function": {
                                            "name": "get_time",
                                            "arguments": '{"city": "Paris"}',
                                        },
                                    },
                                ],
                            },
                            "finish_reason": "tool_calls",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "total_tokens": 30,
                    },
                },
            ),
            Response(
                200,
                json={
                    "id": "chatcmpl-test-2",
                    "object": "chat.completion",
                    "created": 1234567891,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "In Paris, it's always sunny and the time is 14:30! Great time to visit the Eiffel Tower.",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 15,
                        "completion_tokens": 25,
                        "total_tokens": 40,
                    },
                },
            ),
        ]
        yield respx_mock


def get_time(city: str) -> str:
    """Test tool for getting time in a city."""
    return f"The time in {city} is 14:30"


@pytest.fixture
def extra_tools():
    """Provide extra tools for parallel tool calling tests."""
    return [get_time]
