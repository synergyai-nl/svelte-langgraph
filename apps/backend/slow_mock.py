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

3. Fix mockai's ``PreDeterminedResponse.verify_structure`` validator so a
   JSON-file entry can declare *multiple* function-call outputs (needed to
   test parallel tool calls). Pydantic parses an ``output: [...]`` array into
   a ``FunctionOutputs`` RootModel, but the validator checks
   ``isinstance(self.output, list)`` -- a RootModel is not a ``list``
   subclass, so that branch never matches and the (correct) array is
   rejected at file-load time. Since ``mockai/dependencies.py`` validates the
   whole responses file at server startup, a single such entry stops the
   mock from booting at all. The serving path already supports this shape
   (``mockai/openai/services.py`` calls ``response.output._to_dict_list()``,
   which ``FunctionOutputs`` implements) -- only the validator is wrong.

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
# (No self-check here: if upstream ever renames/removes streaming_response,
# the attribute lookup above already fails loudly at import with an
# AttributeError -- nothing to add.)

from mockai.models.common import FunctionOutput, FunctionOutputs  # noqa: E402
from mockai.models.json_file import (  # noqa: E402
    PreDeterminedResponse,
    PreDeterminedResponses,
)
from pydantic import ValidationError  # noqa: E402


def _verify_structure(self):
    if self.type == "function":
        if not isinstance(self.output, (FunctionOutput, FunctionOutputs)):
            raise ValueError(
                "When a response is of type 'function', the output must be a "
                "single FunctionOutput object or an array of FunctionOutput objects"
            )
    elif self.type == "text":
        if not isinstance(self.output, str):
            raise ValueError(
                "When a response is of type 'text', the output must be a string."
            )
    return self


# Pydantic stores model_validators registered via @model_validator in a
# decorator-info map keyed by function name; swapping the wrapped function
# there (rather than reassigning a class attribute) is what actually takes
# effect after model_rebuild -- the class-level method itself is generated
# code that pydantic-core reads from this registry.
_decorator = PreDeterminedResponse.__pydantic_decorators__.model_validators[
    "verify_structure"
]
_decorator.func = _verify_structure
PreDeterminedResponse.model_rebuild(force=True)
PreDeterminedResponses.model_rebuild(force=True)

# Self-check: turn a patch that stopped working into an immediate,
# self-describing import failure. A no-op patch does not fail silently --
# e2e_responses.json's array entry would be rejected and the mock server
# would refuse to boot -- but it surfaces as a bare pydantic ValidationError
# from inside mockai's file loading, which points nowhere near this file.
_PATCH_FAILED = (
    "slow_mock's patch of ai-mock's PreDeterminedResponse.verify_structure did "
    "not take effect, so multi-tool-call fixtures in e2e_responses.json cannot "
    "load. ai-mock's internals likely changed upstream (validator renamed, or "
    "__pydantic_decorators__ restructured) -- update the monkeypatch in "
    "apps/backend/slow_mock.py."
)
try:
    # model_validate (not the constructor) so this exercises the same
    # raw-JSON-shape -> validated-model path that dependencies.py uses to
    # load e2e_responses.json at server startup.
    _probe = PreDeterminedResponse.model_validate(
        {
            "type": "function",
            "input": "__slow_mock_patch_probe__",
            "output": [
                {"name": "probe_a", "arguments": {}},
                {"name": "probe_b", "arguments": {}},
            ],
        }
    )
except ValidationError as exc:
    # The unpatched validator rejects the array outright, so this -- not the
    # length check below -- is the branch that fires if the patch is dead.
    raise RuntimeError(_PATCH_FAILED) from exc

# Belt and braces, for an upstream change where the array still validates but
# no longer serves as two separate tool calls.
if len(_probe.output._to_dict_list()) != 2:  # type: ignore[union-attr]
    raise RuntimeError(_PATCH_FAILED)

# Import after patching so generate_openai_completion_response picks up the
# replacement via module-level name lookup at call time.
from mockai.server import app  # noqa: E402

__all__ = ["app"]
