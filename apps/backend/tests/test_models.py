"""Unit and integration tests for `svelte_langgraph.models.get_chat_model`.

Covers:
- The `_has_known_provider_prefix` helper, which must match langchain's own
  provider-prefix parsing (see `langchain.chat_models.base._parse_model`).
- OpenRouter reasoning passthrough: reasoning text returned by the API lands
  in `additional_kwargs["reasoning_content"]` on the resulting `AIMessage`.
- `CHAT_MODEL_KWARGS` plumbing, including a `reasoning` param making it into
  the outbound request body verbatim.
- Regression guard: an unprefixed `CHAT_MODEL_NAME` still resolves through
  the generic OpenAI-compatible path (honoring `OPENAI_BASE_URL`) -- this
  path is NOT deprecated by adding provider-prefix support, and Ollama-style
  tags like `llama3:8b` must not be mistaken for a `{provider}:` prefix.
- Invalid `CHAT_MODEL_KWARGS` JSON fails loudly at startup.
"""

import json

import pytest
import respx

from svelte_langgraph.models import _has_known_provider_prefix, get_chat_model

from .conftest import (
    DEFAULT_BASE_URL,
    OPENROUTER_MOCK_BASE_URL,
    ProviderCase,
    make_completion_response,
)

# These tests drive `get_chat_model()` directly under a single, precisely
# controlled environment per test. Override conftest's module-scoped
# provider/chat_model matrix (which is meant to exercise the graph broadly)
# with fixed values, so tests here don't needlessly re-run under every
# provider/model combination.


@pytest.fixture(scope="module")
def provider_case() -> ProviderCase:
    return ProviderCase(mock_base_url=DEFAULT_BASE_URL)


@pytest.fixture
def chat_model() -> None:
    return None


@pytest.mark.parametrize(
    ("model_name", "expected"),
    [
        ("openrouter:deepseek/deepseek-r1", True),
        ("llama3:8b", False),
        ("gpt-4o-mini", False),
        ("anthropic:claude-3-5-sonnet-latest", True),
        ("ollama:llama3", True),
        ("something-else-entirely", False),
    ],
)
def test_has_known_provider_prefix(model_name: str, expected: bool) -> None:
    assert _has_known_provider_prefix(model_name) is expected


@pytest.mark.asyncio
async def test_openrouter_reasoning_passthrough(monkeypatch):
    """Reasoning text from an OpenRouter response lands in additional_kwargs."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "openrouter:deepseek/deepseek-r1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENROUTER_API_BASE", OPENROUTER_MOCK_BASE_URL)

    response = make_completion_response(
        message_content="The answer is 4.",
        reasoning="Let me think step by step: 2 + 2 = 4.",
    )

    with respx.mock(base_url=OPENROUTER_MOCK_BASE_URL) as respx_mock:
        respx_mock.post("/chat/completions").mock(return_value=response)

        model = get_chat_model()
        result = await model.ainvoke("What is 2 + 2?")

    assert (
        result.additional_kwargs["reasoning_content"]
        == "Let me think step by step: 2 + 2 = 4."
    )


@pytest.mark.asyncio
async def test_chat_model_kwargs_reasoning_effort_in_request_body(monkeypatch):
    """CHAT_MODEL_KWARGS' reasoning effort is forwarded verbatim in the request body."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "openrouter:deepseek/deepseek-r1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENROUTER_API_BASE", OPENROUTER_MOCK_BASE_URL)
    monkeypatch.setenv(
        "CHAT_MODEL_KWARGS", json.dumps({"reasoning": {"effort": "low"}})
    )

    response = make_completion_response(message_content="Hi there!")

    with respx.mock(base_url=OPENROUTER_MOCK_BASE_URL) as respx_mock:
        route = respx_mock.post("/chat/completions").mock(return_value=response)

        model = get_chat_model()
        await model.ainvoke("hi")

    request_body = json.loads(route.calls.last.request.content)
    assert request_body["reasoning"] == {"effort": "low"}


@pytest.mark.asyncio
async def test_unprefixed_model_name_still_uses_openai_path(monkeypatch):
    """Regression guard: an unprefixed CHAT_MODEL_NAME + OPENAI_BASE_URL keeps
    using the generic OpenAI-compatible path, honoring OPENAI_BASE_URL. This
    path must NOT be deprecated by adding provider-prefix support, and
    Ollama-style tags (e.g. `llama3:8b`) must not be mistaken for a
    `{provider}:` prefix.
    """
    custom_base_url = "http://localhost:11434/v1"
    monkeypatch.setenv("CHAT_MODEL_NAME", "llama3:8b")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENAI_BASE_URL", custom_base_url)
    monkeypatch.delenv("CHAT_MODEL_KWARGS", raising=False)

    response = make_completion_response(message_content="Hello from Ollama!")

    with respx.mock(base_url=custom_base_url) as respx_mock:
        respx_mock.post("/chat/completions").mock(return_value=response)

        model = get_chat_model()
        result = await model.ainvoke("hi")

    assert result.content == "Hello from Ollama!"


def test_invalid_chat_model_kwargs_json_raises(monkeypatch):
    """Invalid CHAT_MODEL_KWARGS JSON must fail loudly rather than being ignored."""
    monkeypatch.setenv("CHAT_MODEL_KWARGS", "{not valid json")

    with pytest.raises(json.JSONDecodeError):
        get_chat_model()


@pytest.mark.parametrize(
    ("value", "expected_type_name"),
    [
        ("[]", "list"),
        ('"x"', "str"),
    ],
)
def test_non_object_chat_model_kwargs_json_raises(
    monkeypatch, value: str, expected_type_name: str
) -> None:
    """CHAT_MODEL_KWARGS that parses to valid JSON but isn't an object must
    fail loudly with a clear message, rather than passing parsing and later
    blowing up with a misleading AttributeError on `kwargs.setdefault`.
    """
    monkeypatch.setenv("CHAT_MODEL_KWARGS", value)

    with pytest.raises(
        ValueError,
        match=f"CHAT_MODEL_KWARGS must be a JSON object, got {expected_type_name}",
    ):
        get_chat_model()
