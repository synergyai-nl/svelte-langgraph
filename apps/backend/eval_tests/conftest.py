"""Pytest configuration and fixtures for LangGraph tests."""

import importlib.util
import sys
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


def load_module(source, module_name):
    """
    reads file source and loads it as a module

    :param source: file to load
    :param module_name: name of module to register in sys.modules
    :return: loaded module
    """

    spec = importlib.util.spec_from_file_location(module_name, source)
    assert spec
    assert spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    return module


DEFAULT_BASE_URL = "https://api.openai.com/v1"


@pytest.fixture
def graph_import():
    try:
        graph_module = load_module("src/graph.py", "graph")
        module_import_path = "graph"

    except FileNotFoundError:
        from svelte_langgraph import graph  # type: ignore[import-not-found]

        graph_module = graph
        module_import_path = "svelte_langgraph.graph"

    yield graph_module, module_import_path


@pytest.fixture
def graph_import_path(graph_import):
    yield graph_import[1]


@pytest.fixture
def graph_module(graph_import):
    yield graph_import[0]


@pytest.fixture
def make_graph(graph_module):
    yield graph_module.make_graph


@pytest.fixture
def get_weather(graph_module):
    yield graph_module.get_weather


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
        # No base URL set: OpenAI base URL default
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
    """Set up environment variables for testing, with various models."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")

    if openai_base_url:
        # Only set if specified
        monkeypatch.setenv("OPENAI_BASE_URL", openai_base_url)

    if chat_model:
        monkeypatch.setenv("CHAT_MODEL_NAME", chat_model)

    monkeypatch.setenv("CHAT_MODEL_TEMPERATURE", "0")


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
    tool_calls: list[ToolCall] = [],
    created: int = 1234567890,
    usage: dict = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
):
    """Create OpenAI API response."""

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
async def agent(thread_config: RunnableConfig, make_graph):
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


@pytest.fixture
def openai_parallel_tool_calls(mock_completion):
    """Mock OpenAI API for parallel tool calls scenario."""
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
                ),
                ToolCall(
                    call_id="call_2",
                    function=Function(
                        name="get_time",
                        arguments='{"city": "Paris"}',
                    ),
                ),
            ],
            finish_reason="tool_calls",
        ),
        make_completion_response(
            response_id="chatcmpl-test-2",
            created=1234567891,
            message_content="In Paris, it's always sunny and the time is 14:30! Great time to visit the Eiffel Tower.",
            usage={
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40,
            },
        ),
    ]
    yield mock_completion
