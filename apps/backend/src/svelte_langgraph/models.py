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


def get_chat_model() -> BaseChatModel:
    model_name = os.getenv("CHAT_MODEL_NAME", "gpt-4o-mini")

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

    kwargs.setdefault("temperature", 0.9)

    if _has_known_provider_prefix(model_name):
        return init_chat_model(model_name, **kwargs)

    return init_chat_model(model_name, model_provider="openai", **kwargs)
