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

# Output-token ceiling for a generated title. This must comfortably exceed
# `graph.TITLE_MAX_CHARS` (60) rather than merely match it: for CJK text a
# token is roughly one character, so a limit set at the character cap would
# truncate legitimate non-Latin titles mid-generation. It is a cost/abuse
# bound, not the length rule -- `sanitize_title` still enforces the real cap.
TITLE_MAX_OUTPUT_TOKENS = 128


def get_title_model() -> BaseChatModel:
    """Chat model used to generate thread titles.

    Deliberately the *same* model as `get_chat_model()` (no second env var to
    keep in sync), but configured for a one-shot, throwaway, 3-6 word
    completion rather than a conversation:

    - Reasoning is stripped. `CHAT_MODEL_KWARGS` is documented in
      `.env.example` as the place to opt into reasoning tokens, and inheriting
      it here would make every thread's first exchange pay for -- and wait on
      -- a reasoning completion just to produce a short label.
    - `max_tokens` bounds the completion. `sanitize_title` only truncates
      *after* the model has generated (and billed for) its output, so without
      this a model that follows an injected instruction could emit thousands
      of tokens while the user's chat run sits there still loading. Every
      other spelling of the limit is cleared first, or a provider-native
      alias would win over it -- see `_TOKEN_LIMIT_KWARGS`.
    - `temperature=0` keeps titles stable across retries, unlike chat's 0.9.
    - `disable_streaming=True` because the tokens are discarded either way:
      `graph.title_gate` tags the call `nostream` so LangGraph won't forward
      them, but that tag alone does not stop the model streaming them over
      HTTP (`BaseChatModel._should_stream` returns True purely because a
      streaming callback handler is attached).
    """
    kwargs = _get_chat_model_kwargs()
    for key in (*_REASONING_KWARGS, *_TOKEN_LIMIT_KWARGS):
        kwargs.pop(key, None)

    kwargs["temperature"] = 0
    kwargs["max_tokens"] = TITLE_MAX_OUTPUT_TOKENS
    kwargs["disable_streaming"] = True

    return _build_chat_model(_get_model_name(), **kwargs)
