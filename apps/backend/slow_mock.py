"""ai-mock wrapper with slow streaming for E2E cancellation tests.

Monkey-patches mockai's sync streaming generator to add a small delay between
yielded SSE chunks, so useStream has a wide enough window for the stop button
to be clickable and for server-side cancellation to interrupt a still-running
LangGraph node.

Usage (via moon backend:ai-mock-e2e):
    uvicorn slow_mock:app --host 127.0.0.1 --port 8100

Environment:
    MOCK_STREAM_DELAY  Seconds between SSE chunks (default: 0.01 = 10ms)
"""

import os
import time

import mockai.openai.services as _services

try:
    _DELAY = float(os.environ.get("MOCK_STREAM_DELAY", "0.01"))
except (ValueError, TypeError):
    _DELAY = 0.01
_original_streaming_response = _services.streaming_response


def _slow_streaming_response(*args, **kwargs):
    for chunk in _original_streaming_response(*args, **kwargs):
        yield chunk
        time.sleep(_DELAY)


_services.streaming_response = _slow_streaming_response

# Import after patching so generate_openai_completion_response picks up the
# replacement via module-level name lookup at call time.
from mockai.server import app  # noqa: E402

__all__ = ["app"]
