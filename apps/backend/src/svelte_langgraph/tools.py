import asyncio
import random
from typing import Annotated, Callable, Literal, Sequence

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId
from langgraph.types import Command

VALID_PHASES: frozenset[str] = frozenset({"draft", "research", "review"})


def validate_phase(phase: str) -> None:
    """Raise ValueError if phase is not one of the valid enum values."""
    if phase not in VALID_PHASES:
        raise ValueError(
            f"Invalid phase {phase!r}. Must be one of: {sorted(VALID_PHASES)}"
        )


async def get_weather(city: str) -> str:
    """Get weather for a given city."""
    await asyncio.sleep(random.randint(1, 10))

    return f"It's always sunny in {city}!"


def change_phase(
    phase: Literal["research", "draft", "review"],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Change the current working phase."""
    try:
        validate_phase(phase)
    except ValueError as exc:
        # The `phase` Literal already constrains schema-level tool-call args, so
        # ToolNode's default handle_tool_errors normally intercepts a bad value
        # via a pydantic ValidationError before this body ever runs. This is a
        # defense-in-depth backstop for cases where that's not true (e.g. the
        # Literal and VALID_PHASES drift apart, or a caller bypasses schema
        # validation): a bare ValueError raised here isn't a ToolInvocationError,
        # so the default handler re-raises it and fails the whole run instead of
        # producing a recoverable ToolMessage. Return the error as a Command with
        # no state update so the run continues gracefully.
        return Command(
            update={
                "messages": [
                    ToolMessage(str(exc), tool_call_id=tool_call_id, status="error")
                ],
            }
        )
    return Command(
        update={
            "phase": phase,
            "messages": [
                ToolMessage(f"Phase changed to {phase}.", tool_call_id=tool_call_id)
            ],
        }
    )


def get_tools() -> Sequence[Callable]:
    return [get_weather, change_phase]
