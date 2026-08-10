import asyncio
import random
from typing import Annotated, Callable, Sequence

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId
from langgraph.types import Command

from .phase import Phase


async def get_weather(city: str) -> str:
    """Get weather for a given city."""
    await asyncio.sleep(random.randint(1, 10))

    return f"It's always sunny in {city}!"


def change_phase(
    phase: Phase,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Change the current working phase."""
    # The `phase` Literal constrains schema-level tool-call args: ToolNode's
    # default handle_tool_errors turns a bad LLM-supplied value into a
    # recoverable error ToolMessage via pydantic validation before this body
    # ever runs.
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
