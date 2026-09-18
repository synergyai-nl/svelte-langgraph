import json
import os
from typing import Any

from langchain.chat_models import BaseChatModel, init_chat_model
from langchain.chat_models.base import _BUILTIN_PROVIDERS


def _has_known_provider_prefix(model_name: str) -> bool:
    """Whether `model_name` has a `{provider}:` prefix `init_chat_model` would
    itself recognize (mirrors `langchain.chat_models.base._parse_model`).
    Excludes Ollama-style tags like `llama3:8b` -- `llama3` isn't a provider
    key.
    """
    if ":" not in model_name:
        return False
    prefix = model_name.split(":", maxsplit=1)[0]
    return prefix in _BUILTIN_PROVIDERS


_RESERVED_CHAT_MODEL_KWARGS = {"model", "model_provider"}


def _get_model_name() -> str:
    return os.getenv("CHAT_MODEL_NAME", "gpt-4o-mini")


def _get_chat_model_kwargs() -> dict[str, Any]:
    """Parse and validate `CHAT_MODEL_KWARGS`, shared by both entry points."""
    raw_kwargs = os.getenv("CHAT_MODEL_KWARGS")
    raw_kwargs = raw_kwargs.strip() if raw_kwargs else ""
    kwargs: Any = json.loads(raw_kwargs) if raw_kwargs else {}
    if not isinstance(kwargs, dict):
        raise ValueError(
            f"CHAT_MODEL_KWARGS must be a JSON object, got {type(kwargs).__name__}"
        )

    reserved_keys_used = _RESERVED_CHAT_MODEL_KWARGS & kwargs.keys()
    if reserved_keys_used:
        offending_key = sorted(reserved_keys_used)[0]
        raise ValueError(
            f"CHAT_MODEL_KWARGS must not include {offending_key!r}; select the "
            "model and provider via CHAT_MODEL_NAME instead."
        )

    return kwargs


def _build_chat_model(model_name: str, **kwargs: Any) -> BaseChatModel:
    """Route `model_name` to `init_chat_model`, defaulting to the OpenAI
    provider for names without a provider prefix langchain would recognize."""
    if _has_known_provider_prefix(model_name):
        return init_chat_model(model_name, **kwargs)

    return init_chat_model(model_name, model_provider="openai", **kwargs)


def get_chat_model() -> BaseChatModel:
    kwargs = _get_chat_model_kwargs()
    kwargs.setdefault("temperature", 0.9)
    return _build_chat_model(_get_model_name(), **kwargs)


# Reasoning-config keys stripped for the title model: OpenRouter's nested
# `reasoning`, OpenAI's flat `reasoning_effort`, Anthropic's `thinking`.
# Popping all three keeps the title call cheap regardless of provider.
_REASONING_KWARGS = ("reasoning", "reasoning_effort", "thinking")

# Output-token spellings cleared before the title ceiling is applied.
# `ChatOpenAI.max_tokens` declares `max_completion_tokens` as its pydantic
# alias, and with `populate_by_name=True` the *alias* wins when both are
# supplied -- so a stray `max_completion_tokens` in CHAT_MODEL_KWARGS would
# silently override the ceiling below unless every spelling is popped first.
_TOKEN_LIMIT_KWARGS = ("max_tokens", "max_completion_tokens", "max_output_tokens")

# Structured-output constraints stripped for the title call, which asks for
# plain prose: inheriting chat's `response_format` would either make the
# provider reject the prompt (OpenAI JSON mode) or return JSON that
# `sanitize_title` would persist as the sidebar label.
_STRUCTURED_OUTPUT_KWARGS = (
    "response_format",
    "response_schema",
    "response_mime_type",
)

# Must comfortably exceed `title.TITLE_MAX_CHARS` (60): for CJK text a token
# is roughly one character, so a limit at the character cap would truncate
# mid-generation. A cost/abuse bound -- `sanitize_title` enforces the real cap.
TITLE_MAX_OUTPUT_TOKENS = 128


def _get_title_model_name() -> str:
    """`TITLE_MODEL_NAME`, falling back to `CHAT_MODEL_NAME` when unset."""
    return os.getenv("TITLE_MODEL_NAME") or _get_model_name()


def get_title_model() -> BaseChatModel:
    """Chat model used to generate thread titles: a one-shot, 3-6 word
    completion, not a conversation.

    When `TITLE_MODEL_NAME` is set, CHAT_MODEL_KWARGS is skipped entirely --
    it's provider-specific to the chat model and may not even be valid for a
    different provider. Otherwise this falls back to CHAT_MODEL_NAME and
    reuses CHAT_MODEL_KWARGS, stripped of reasoning, token-limit, and
    structured-output keys (see the constants above).

    Both paths pin `temperature=0`, `max_tokens=TITLE_MAX_OUTPUT_TOKENS`, and
    `disable_streaming=True`.
    """
    if os.getenv("TITLE_MODEL_NAME"):
        kwargs: dict[str, Any] = {}
    else:
        kwargs = _get_chat_model_kwargs()
        for key in (
            *_REASONING_KWARGS,
            *_TOKEN_LIMIT_KWARGS,
            *_STRUCTURED_OUTPUT_KWARGS,
        ):
            kwargs.pop(key, None)

    kwargs["temperature"] = 0
    kwargs["max_tokens"] = TITLE_MAX_OUTPUT_TOKENS
    kwargs["disable_streaming"] = True

    return _build_chat_model(_get_title_model_name(), **kwargs)
