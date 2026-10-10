"""Which run produced which AI message, recorded on the message itself.

A rating names a message, but a Langfuse trace belongs to a run. Checkpoint
history can't bridge the two reliably: the SDK fetches only the latest ten
checkpoints, past which an answer's own checkpoint is gone. So the producing
run is written onto the message as it is created, and travels with it in
thread state for as long as the message exists.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import (
    ModelCallResult,
    ModelRequest,
    ModelResponse,
)
from langchain_core.messages import AIMessage
from langgraph.config import get_config

# response_metadata, not additional_kwargs: provider adapters forward some of
# the latter back to the model, never the former.
RUN_ID_KEY = "run_id"


def _stamp(response: ModelResponse) -> ModelResponse:
    run_id = (get_config().get("configurable") or {}).get("run_id")
    if run_id:
        for message in response.result:
            if isinstance(message, AIMessage):
                message.response_metadata[RUN_ID_KEY] = str(run_id)
    return response


class RunStampMiddleware(AgentMiddleware[Any, None, Any]):
    """Stamps each AI message with the run that produced it."""

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        return _stamp(handler(request))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        return _stamp(await handler(request))


def run_id_for_message(messages: list[Any], message_id: str) -> str | None:
    """The stamped producing run of `message_id`, from serialized thread state.

    None for a message that isn't there, isn't an AI answer, or predates the
    stamp. Those last ones are deliberately not guessed at: their traces got a
    random id, so no run id would lead to them.
    """
    for message in messages:
        if not isinstance(message, dict) or message.get("id") != message_id:
            continue
        if message.get("type") != "ai":
            return None
        run_id = (message.get("response_metadata") or {}).get(RUN_ID_KEY)
        return run_id if isinstance(run_id, str) and run_id else None
    return None
