import os
from typing import Any


def get_tracing_callbacks() -> list[Any]:
    """Return LangChain callback handlers for the configured tracing backend.

    Add or swap backends here without touching graph.py.
    """
    callbacks: list[Any] = []

    if os.getenv("LANGFUSE_SECRET_KEY"):
        try:
            from langfuse.langchain import CallbackHandler

            callbacks.append(CallbackHandler())
        except ImportError:
            pass

    return callbacks
