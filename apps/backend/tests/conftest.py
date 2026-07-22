"""Shared test fixtures for LangGraph agent tests.

This module provides fixtures for mocking OpenAI-compatible API responses across
different providers (OpenAI, OpenRouter-as-base-url, Ollama, and the native
`openrouter:` provider-prefixed path) and models. It uses official OpenAI SDK
types to ensure type compatibility with the actual API schema; empirically, the
`openrouter` SDK's response parsing accepts these OpenAI-SDK-shaped payloads
without any changes, including an injected `reasoning` field, so no separate
hand-built response dicts are needed for the OpenRouter-prefixed cases.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
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
OPENROUTER_MOCK_BASE_URL = "https://mock-openrouter.test/api/v1"


@dataclass(frozen=True)
class ProviderCase:
    """Describes one provider environment scenario under test.

    `mock_base_url` is where respx intercepts `/chat/completions`. `env`
    holds the environment variables that make `get_chat_model()` route to
    that base URL. `supports_chat_model_override` marks whether the generic
    `chat_model` fixture (which overrides `CHAT_MODEL_NAME`) may be layered on
    top of this case without clobbering a case-specific model name.
    """

    mock_base_url: str
    env: dict[str, str] = field(default_factory=dict)
    supports_chat_model_override: bool = True


PROVIDER_CASES = (
    # Default OpenAI-compatible path: no OPENAI_BASE_URL override.
    ProviderCase(mock_base_url=DEFAULT_BASE_URL),
    # OpenAI-compatible path pointed at OpenRouter via base URL (no `openrouter:` prefix).
    ProviderCase(
        mock_base_url="https://openrouter.ai/api/v1",
        env={"OPENAI_BASE_URL": "https://openrouter.ai/api/v1"},
    ),
    # OpenAI-compatible path pointed at a local Ollama server.
    ProviderCase(
        mock_base_url="http://localhost:11434/v1",
        env={"OPENAI_BASE_URL": "http://localhost:11434/v1"},
    ),
    # Native `openrouter:` provider-prefixed path (langchain-openrouter / ChatOpenRouter).
    ProviderCase(
        mock_base_url=OPENROUTER_MOCK_BASE_URL,
        env={
            "CHAT_MODEL_NAME": "openrouter:deepseek/deepseek-r1",
            "OPENROUTER_API_KEY": "test-api-key",
            "OPENROUTER_API_BASE": OPENROUTER_MOCK_BASE_URL,
        },
        supports_chat_model_override=False,
    ),
)


@pytest.fixture(params=PROVIDER_CASES, scope="module")
def provider_case(request) -> ProviderCase:
    return request.param


@pytest.fixture
def mock_completion(provider_case: ProviderCase):
    """Mock the chat completions endpoint for the current provider case."""

    with respx.mock(base_url=provider_case.mock_base_url) as respx_mock:
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
def env_setup(monkeypatch, provider_case: ProviderCase, chat_model):
    """Set up environment variables for testing."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")

    for key, value in provider_case.env.items():
        monkeypatch.setenv(key, value)

    if chat_model and provider_case.supports_chat_model_override:
        monkeypatch.setenv("CHAT_MODEL_NAME", chat_model)


async def get_weather(city: str) -> str:
    """Fast, deterministic mock for get_weather.

    The real get_weather has a random 1-10 second sleep, so we use this
    mock to make tests fast and deterministic.
    """
    return f"It's always sunny in {city}!"


FinishReason = Literal["stop", "tool_calls"]


class CompletionResponse(Response):
    def __init__(
        self,
        status_code: int,
        completion: ChatCompletion,
        reasoning: str | None = None,
    ) -> None:
        payload = completion.model_dump()
        if reasoning is not None:
            # `reasoning` isn't part of the OpenAI SDK's `ChatCompletionMessage`
            # type, so it can't be passed to the ChatCompletion constructor
            # directly. It's the shape OpenRouter's raw HTTP response uses for
            # reasoning-capable models: `choices[0].message.reasoning`.
            payload["choices"][0]["message"]["reasoning"] = reasoning
        super().__init__(status_code, json=payload)


@dataclass
class CompletionMeta:
    """Response-shaping fields for `make_completion_response`, grouped so the
    factory doesn't need a long flat parameter list.

    These describe the *envelope* of a chat completion (its id, timestamp,
    finish reason, and token usage) as opposed to the message content itself,
    which callers pass directly to `make_completion_response`.
    """

    finish_reason: FinishReason = "stop"
    response_id: str = "chatcmpl-test"
    created: int = 1234567890
    usage: CompletionUsage | None = None


def make_completion_response(
    message_content: str | None = None,
    tool_calls: Sequence[ChatCompletionMessageToolCallUnion] | None = None,
    reasoning: str | None = None,
    meta: CompletionMeta | None = None,
):
    """Create OpenAI API response using OpenAI SDK types.

    `reasoning`, when given, is injected into `choices[0].message.reasoning`
    to emulate an OpenRouter reasoning-model response. `meta` overrides the
    response envelope (id, created timestamp, finish reason, usage) -- see
    `CompletionMeta`.
    """
    if meta is None:
        meta = CompletionMeta()
    usage = meta.usage
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
        finish_reason=meta.finish_reason,
        logprobs=None,
    )

    completion = ChatCompletion(
        id=meta.response_id,
        object="chat.completion",
        created=meta.created,
        model="gpt-4o-mini",
        choices=[choice],
        usage=usage,
    )

    return CompletionResponse(200, completion=completion, reasoning=reasoning)


@pytest.fixture
def thread_config() -> RunnableConfig:
    """Create a unique thread configuration for each test."""
    return RunnableConfig(
        configurable={"thread_id": str(uuid4()), "user_name": "Alice"}
    )


@pytest_asyncio.fixture
async def agent(thread_config: RunnableConfig, monkeypatch):
    """Create a LangGraph agent for testing.

    Uses the local get_weather mock instead of the real get_weather to avoid
    the random 1-10 second sleep in the real implementation.
    """

    # Mock the get_tools function where it's imported in graph.py
    def mock_get_tools():
        return [get_weather]

    monkeypatch.setattr("svelte_langgraph.graph.get_tools", mock_get_tools)
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
            meta=CompletionMeta(
                response_id="chatcmpl-test-1", finish_reason="tool_calls"
            ),
        ),
        make_completion_response(
            message_content="Based on the weather information, it's always sunny in Paris! Perfect weather for sightseeing.",
            meta=CompletionMeta(
                response_id="chatcmpl-test-2",
                created=1234567891,
                usage=CompletionUsage(
                    prompt_tokens=15,
                    completion_tokens=25,
                    total_tokens=40,
                ),
            ),
        ),
    ]

    yield mock_completion
