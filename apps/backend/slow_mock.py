"""ai-mock wrapper with slow streaming and spec-correct tool-call chunks for E2E.

Monkey-patches mockai's sync streaming generator to:

1. Add a small delay between yielded SSE chunks, so useStream has a wide enough
   window for the stop button to be clickable and for server-side cancellation
   to interrupt a still-running LangGraph node.

2. Emit OpenAI-conformant streamed tool calls. Stock mockai repeats the tool
   call's ``id``/``name`` in every delta and omits the required ``index``
   field, so OpenAI clients (e.g. langchain-openai) cannot accumulate the
   argument chunks and tools get called with empty arguments. We instead send
   a header delta (index, id, type, name) followed by argument-fragment deltas
   carrying only ``index`` and ``function.arguments``, per the OpenAI spec.

Usage (via moon backend:ai-mock-e2e):
    uvicorn slow_mock:app --host 127.0.0.1 --port 8100

Environment:
    MOCK_STREAM_DELAY  Seconds between SSE chunks (default: 0.01 = 10ms)
"""

import json
import os
import time
from typing import Any
from uuid import uuid4

import mockai.openai.services as _services

try:
    _DELAY = float(os.environ.get("MOCK_STREAM_DELAY", "0.01"))
except (ValueError, TypeError):
    _DELAY = 0.01
_original_streaming_response = _services.streaming_response


def _chunk(
    completion_id: str, model: str, delta: dict, finish_reason: str | None = None
):
    payload = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "system_fingerprint": "mock",
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "logprobs": None,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"


def _tool_call_streaming_response(model: str, tool_calls: list[dict]):
    completion_id = f"chatcmpl-{uuid4().hex}"

    for n, tool_call in enumerate(tool_calls):
        # Header delta: identifies the tool call; arguments start empty.
        yield _chunk(
            completion_id,
            model,
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "index": n,
                        "id": tool_call["id"],
                        "type": tool_call["type"],
                        "function": {
                            "name": tool_call["function"]["name"],
                            "arguments": "",
                        },
                    }
                ],
            },
        )

        arguments = tool_call["function"]["arguments"]
        arguments_json = (
            arguments if isinstance(arguments, str) else json.dumps(arguments)
        )
        # Argument fragments: only index + arguments, per the OpenAI spec.
        for char in arguments_json:
            yield _chunk(
                completion_id,
                model,
                {"tool_calls": [{"index": n, "function": {"arguments": char}}]},
            )

    yield _chunk(completion_id, model, {}, finish_reason="tool_calls")
    yield "data: [DONE]\n\n"


def _patched_streaming_response(*args, **kwargs):
    # Signature-agnostic: mockai passes (content, model, tool_calls) today, but
    # extract by position-or-keyword so a reordered or keyword-only upstream
    # call keeps working; unknown extra parameters pass through untouched.
    params: dict[str, Any] = dict(zip(("content", "model", "tool_calls"), args))
    params.update(kwargs)
    model = params.get("model") or "mock"
    tool_calls = params.get("tool_calls")

    if tool_calls is not None:
        source = _tool_call_streaming_response(model, tool_calls)
    else:
        source = _original_streaming_response(*args, **kwargs)

    for chunk in source:
        yield chunk
        time.sleep(_DELAY)


_services.streaming_response = _patched_streaming_response

# Import after patching so generate_openai_completion_response picks up the
# replacement via module-level name lookup at call time.
from mockai.server import app  # noqa: E402

__all__ = ["app"]
