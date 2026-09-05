import json
import os
from typing import Any

from langchain.chat_models import BaseChatModel, init_chat_model
from langchain.chat_models.base import _BUILTIN_PROVIDERS


def _has_known_provider_prefix(model_name: str) -> bool:
    """Check whether `model_name` has a `{provider}:` prefix that langchain's
    `init_chat_model` would itself recognize and strip.

    This mirrors the exact condition used in langchain's own
    `langchain.chat_models.base._parse_model`: a prefix (the substring before
    the first colon) is only treated as a provider if it is a key in
    `_BUILTIN_PROVIDERS`. This intentionally excludes things like Ollama-style
    tags (e.g. `llama3:8b`), since `llama3` is not a known provider key.
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


# Reasoning-configuration keys stripped for the title model. `reasoning` is the
# nested OpenRouter form that `.env.example` documents
# (`{"reasoning":{"effort":"low"}}`); `reasoning_effort` is the flat OpenAI
# form; `thinking` is the Anthropic form. Popping all three keeps the title
# call cheap regardless of which provider CHAT_MODEL_NAME selects.
_REASONING_KWARGS = ("reasoning", "reasoning_effort", "thinking")

# Output-token spellings cleared before the title ceiling is applied. These are
# not merely "other names we also set" -- leaving one in place actively defeats
# the ceiling: `ChatOpenAI.max_tokens` declares `max_completion_tokens` as its
# pydantic alias, and with `populate_by_name=True` the *alias* wins when both
# are supplied. So `CHAT_MODEL_KWARGS={"max_completion_tokens": 4096}` would
# silently override the 128 set below. Popping every spelling first guarantees
# the title ceiling is the only one in play.
_TOKEN_LIMIT_KWARGS = ("max_tokens", "max_completion_tokens", "max_output_tokens")

# Structured-output constraints stripped for the title call, which asks for
# plain prose. Inheriting a chat-side `response_format` would either make the
# provider reject this prompt (OpenAI JSON mode requires the word "JSON" in
# the messages) or, in schema mode, return a JSON document that
# `sanitize_title` would dutifully persist as the sidebar label. The Google
# spellings are included for the same reason as the reasoning dialects: which
# one applies depends on the provider `CHAT_MODEL_NAME` selects.
_STRUCTURED_OUTPUT_KWARGS = (
    "response_format",
    "response_schema",
    "response_mime_type",
)

# Output-token ceiling for a generated title. This must comfortably exceed
# `title.TITLE_MAX_CHARS` (60) rather than merely match it: for CJK text a
# token is roughly one character, so a limit set at the character cap would
# truncate legitimate non-Latin titles mid-generation. It is a cost/abuse
# bound, not the length rule -- `sanitize_title` still enforces the real cap.
TITLE_MAX_OUTPUT_TOKENS = 128


def _get_title_model_name() -> str:
    """`TITLE_MODEL_NAME`, falling back to `CHAT_MODEL_NAME` when unset."""
    return os.getenv("TITLE_MODEL_NAME") or _get_model_name()


def get_title_model() -> BaseChatModel:
    """Chat model used to generate thread titles: a one-shot, throwaway,
    3-6 word completion rather than a conversation.

    When `TITLE_MODEL_NAME` is set, that model is built with *only* the title
    kwargs below -- `CHAT_MODEL_KWARGS` is provider-specific to the chat model
    and may not even be valid for a different provider/model. When unset, this
    falls back to `CHAT_MODEL_NAME` and derives from `CHAT_MODEL_KWARGS`,
    stripped of:

    - Reasoning kwargs. `CHAT_MODEL_KWARGS` is documented in `.env.example` as
      the place to opt into reasoning tokens, and inheriting it here would
      make every title call pay for -- and wait on -- a reasoning completion
      just to produce a short label.
    - Every spelling of the output-token limit, before applying the title
      ceiling -- otherwise a provider-native alias would win over it, see
      `_TOKEN_LIMIT_KWARGS`.
    - Structured-output kwargs, which would fight the plain-prose title
      prompt.

    Both paths always set: `temperature=0` (stable titles, unlike chat's
    0.9), `max_tokens=TITLE_MAX_OUTPUT_TOKENS` (a cost/abuse bound --
    `sanitize_title` still enforces the real length rule), and
    `disable_streaming=True` (the title call is a single throwaway
    completion; nothing consumes partial tokens).
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
