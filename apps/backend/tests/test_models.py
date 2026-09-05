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

from svelte_langgraph.models import (
    TITLE_MAX_OUTPUT_TOKENS,
    _REASONING_KWARGS,
    _STRUCTURED_OUTPUT_KWARGS,
    _TOKEN_LIMIT_KWARGS,
    _has_known_provider_prefix,
    get_chat_model,
    get_title_model,
)

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


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["", "   \n\t  "])
async def test_empty_chat_model_kwargs_env_behaves_as_empty_object(
    monkeypatch, value: str
) -> None:
    """An empty or whitespace-only CHAT_MODEL_KWARGS (e.g. `CHAT_MODEL_KWARGS=`
    in a .env file) must be treated as `{}` rather than failing JSON parsing --
    the intent of an empty value is clearly "no extra kwargs".
    """
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", value)

    response = make_completion_response(message_content="Hello!")

    with respx.mock(base_url=DEFAULT_BASE_URL) as respx_mock:
        respx_mock.post("/chat/completions").mock(return_value=response)

        model = get_chat_model()
        result = await model.ainvoke("hi")

    assert result.content == "Hello!"


@pytest.mark.parametrize(
    "reserved_kwargs", ['{"model_provider": "openai"}', '{"model": "x"}']
)
def test_reserved_chat_model_kwargs_key_raises(
    monkeypatch, reserved_kwargs: str
) -> None:
    """`model`/`model_provider` in CHAT_MODEL_KWARGS must fail loudly with a
    clear message rather than blowing up with a confusing duplicate-kwarg
    `TypeError` from `init_chat_model` -- provider/model selection belongs in
    CHAT_MODEL_NAME.
    """
    monkeypatch.setenv("CHAT_MODEL_KWARGS", reserved_kwargs)

    with pytest.raises(ValueError, match="CHAT_MODEL_KWARGS must not include"):
        get_chat_model()


@pytest.mark.parametrize(
    "reserved_kwargs", ['{"model_provider": "openai"}', '{"model": "x"}']
)
def test_reserved_chat_model_kwargs_key_raises_on_prefixed_path(
    monkeypatch, reserved_kwargs: str
) -> None:
    """Same as above, but for the provider-prefixed CHAT_MODEL_NAME path, to
    guard against the reserved-key check only being applied to one branch.
    """
    monkeypatch.setenv("CHAT_MODEL_NAME", "openrouter:deepseek/deepseek-r1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", reserved_kwargs)

    with pytest.raises(ValueError, match="CHAT_MODEL_KWARGS must not include"):
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


def _effective_reasoning_config(model) -> dict:
    """Reasoning settings actually in effect on a built model.

    Substring-matching the model dump does not work: ChatOpenAI declares
    `reasoning` and `reasoning_effort` as native fields, so those names are
    always present in the dump regardless of whether they are configured.
    What matters is their *values*, plus any dialect that fell through to
    `model_kwargs` passthrough (e.g. Anthropic's `thinking`).
    """
    passthrough = getattr(model, "model_kwargs", {}) or {}
    return {
        "reasoning": getattr(model, "reasoning", None),
        "reasoning_effort": getattr(model, "reasoning_effort", None),
        "passthrough": {k: v for k, v in passthrough.items() if k in _REASONING_KWARGS},
    }


def _has_reasoning(model) -> bool:
    config = _effective_reasoning_config(model)
    return bool(
        config["reasoning"] or config["reasoning_effort"] or config["passthrough"]
    )


def test_title_model_strips_reasoning_configuration(monkeypatch) -> None:
    """`.env.example` documents CHAT_MODEL_KWARGS as the place to opt into
    reasoning tokens. Inheriting that for the title call would make every
    thread's first exchange pay for -- and wait on -- a reasoning completion
    just to produce a 3-6 word label, so `get_title_model` strips it.

    Asserted on the built model rather than over the wire, so the guarantee
    holds regardless of how a given provider serializes the parameter.
    """
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv(
        "CHAT_MODEL_KWARGS", json.dumps({"reasoning": {"effort": "low"}})
    )

    # The chat model keeps it -- this is what makes the title-model assertion
    # below meaningful rather than vacuous.
    assert _has_reasoning(get_chat_model())

    assert not _has_reasoning(get_title_model())


@pytest.mark.parametrize(
    ("reasoning_key", "reasoning_value"),
    [
        # Each dialect's real shape -- ChatOpenAI validates `reasoning_effort`
        # as a string, so a uniform dict would fail construction rather than
        # exercise the stripping.
        ("reasoning", {"effort": "low"}),
        ("reasoning_effort", "low"),
        ("thinking", {"type": "enabled", "budget_tokens": 1024}),
    ],
)
def test_title_model_strips_every_reasoning_dialect(
    monkeypatch, reasoning_key: str, reasoning_value
) -> None:
    """Each provider spells reasoning configuration differently (nested
    `reasoning` for OpenRouter, flat `reasoning_effort` for OpenAI, `thinking`
    for Anthropic). All are stripped, so the title call stays cheap whichever
    provider `CHAT_MODEL_NAME` selects."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv(
        "CHAT_MODEL_KWARGS", json.dumps({reasoning_key: reasoning_value})
    )

    assert _has_reasoning(get_chat_model())
    assert not _has_reasoning(get_title_model())


def test_title_model_bounds_output_tokens_and_pins_temperature(monkeypatch) -> None:
    """`sanitize_title` only truncates *after* the model has generated (and
    billed for) its output, so the title call carries its own completion-token
    ceiling. Temperature is pinned to 0 for stability across retries, and
    streaming is disabled because the tokens are discarded either way.

    The ceiling must comfortably exceed `title.TITLE_MAX_CHARS`: for CJK a
    token is roughly one character, so a limit set at the character cap would
    truncate legitimate non-Latin titles mid-generation.
    """
    from svelte_langgraph.title import TITLE_MAX_CHARS

    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.delenv("CHAT_MODEL_KWARGS", raising=False)

    model = get_title_model()

    # `getattr`: these are provider-specific fields, not on `BaseChatModel`.
    assert getattr(model, "max_tokens", None) == TITLE_MAX_OUTPUT_TOKENS
    assert TITLE_MAX_OUTPUT_TOKENS > TITLE_MAX_CHARS
    assert getattr(model, "temperature", None) == 0
    assert model.disable_streaming is True


def test_title_model_still_honours_non_reasoning_kwargs(monkeypatch) -> None:
    """Stripping reasoning must not throw away unrelated CHAT_MODEL_KWARGS --
    the title model is deliberately the *same* model as the chat model, just
    configured for a one-shot completion."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv(
        "CHAT_MODEL_KWARGS",
        json.dumps({"reasoning": {"effort": "low"}, "timeout": 42}),
    )

    assert getattr(get_title_model(), "request_timeout", None) == 42


def test_title_model_name_env_overrides_chat_model_name(monkeypatch) -> None:
    """TITLE_MODEL_NAME, when set, selects the title model independently of
    CHAT_MODEL_NAME."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("TITLE_MODEL_NAME", "gpt-4o")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")

    assert getattr(get_title_model(), "model_name", None) == "gpt-4o"
    assert getattr(get_chat_model(), "model_name", None) == "gpt-4o-mini"


def test_title_model_name_env_ignores_chat_model_kwargs(monkeypatch) -> None:
    """CHAT_MODEL_KWARGS is provider-specific to the chat model, so it must
    not be applied when TITLE_MODEL_NAME selects a (possibly different)
    model/provider -- only the fixed title kwargs apply."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("TITLE_MODEL_NAME", "gpt-4o")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", json.dumps({"timeout": 42}))

    assert getattr(get_title_model(), "request_timeout", None) != 42
    # Non-vacuous: the chat model really does carry it.
    assert getattr(get_chat_model(), "request_timeout", None) == 42


def test_title_model_rejects_reserved_kwargs(monkeypatch) -> None:
    """The reserved-key validation is shared, so it guards both entry points."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", json.dumps({"model": "x"}))

    with pytest.raises(ValueError, match="CHAT_MODEL_KWARGS must not include"):
        get_title_model()


@pytest.mark.parametrize("limit_key", _TOKEN_LIMIT_KWARGS)
def test_title_ceiling_survives_provider_native_token_limit_aliases(
    monkeypatch, limit_key: str
) -> None:
    """A token limit configured for *chat* must not leak into the title call
    and defeat its ceiling.

    This is not merely cosmetic de-duplication: `ChatOpenAI.max_tokens`
    declares `max_completion_tokens` as its pydantic alias and the model is
    built with `populate_by_name=True`, so when both the field name and the
    alias are supplied the *alias* wins. A deployment using the standard
    OpenAI spelling `{"max_completion_tokens": 4096}` would therefore silently
    override the title-specific ceiling unless every spelling is cleared
    first.
    """
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", json.dumps({limit_key: 4096}))

    assert getattr(get_title_model(), "max_tokens", None) == TITLE_MAX_OUTPUT_TOKENS


def test_chat_model_keeps_its_configured_token_limit(monkeypatch) -> None:
    """Guards the test above from going vacuous: the limit really is applied
    to the chat model, so the title model dropping it is a genuine
    difference rather than the value never having taken effect."""
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("CHAT_MODEL_KWARGS", json.dumps({"max_completion_tokens": 4096}))

    assert getattr(get_chat_model(), "max_tokens", None) == 4096


@pytest.mark.parametrize("structured_key", _STRUCTURED_OUTPUT_KWARGS)
def test_title_model_strips_structured_output_constraints(
    monkeypatch, structured_key: str
) -> None:
    """The title call asks for plain prose, so chat-side structured-output
    settings must not leak into it.

    With OpenAI JSON mode the provider rejects a prompt that never mentions
    JSON; with schema mode it returns a JSON document that `sanitize_title`
    would dutifully persist as the sidebar label.
    """
    monkeypatch.setenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv(
        "CHAT_MODEL_KWARGS", json.dumps({structured_key: {"type": "json_object"}})
    )

    title_dump = str(get_title_model().model_dump())
    assert f"'{structured_key}'" not in title_dump

    # Non-vacuous: the chat model really does carry it.
    assert f"'{structured_key}'" in str(get_chat_model().model_dump())
