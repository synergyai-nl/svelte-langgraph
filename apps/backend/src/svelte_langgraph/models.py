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


def get_chat_model() -> BaseChatModel:
    model_name = os.getenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    kwargs: Any = json.loads(os.getenv("CHAT_MODEL_KWARGS", "{}"))
    if not isinstance(kwargs, dict):
        raise ValueError(
            f"CHAT_MODEL_KWARGS must be a JSON object, got {type(kwargs).__name__}"
        )
    kwargs.setdefault("temperature", 0.9)

    if _has_known_provider_prefix(model_name):
        return init_chat_model(model_name, **kwargs)

    return init_chat_model(model_name, model_provider="openai", **kwargs)
