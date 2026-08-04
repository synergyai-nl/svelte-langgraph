"""Generic last-write-wins reducer for LangGraph state channels.

Any state field a tool can write via `Command(update={...})` is vulnerable to
LangGraph's `InvalidUpdateError` if two tool calls inside the same assistant
message (parallel tool calls) write to it in the same superstep: `ToolNode`
runs tool calls concurrently via `executor.map` and only merges `Command`
objects that target the *parent* graph, so sibling tool calls in the same
step each produce their own `Command` against a shared field's channel. A
field declared with no reducer accepts only one value per step and raises.

Annotate any tool-writable state field with `last_value` (e.g.
`phase: Annotated[Phase, last_value]`) so concurrent writes resolve
deterministically to the most recently produced one instead of raising.
`executor.map` preserves `tool_calls` order, so "last" here means the last
tool call in the assistant message's `tool_calls` list -- matching the
intuitive reading of e.g. "switch to draft, then switch to review".
"""

from typing import TypeVar

T = TypeVar("T")


def last_value(left: T, right: T) -> T:
    """Reducer: resolve concurrent per-step writes to a channel by keeping
    the most recently produced value.

    LangGraph's `BinaryOperatorAggregate` channel folds pending writes for a
    step by repeatedly calling this with the current channel value as `left`
    and each new write as `right`, in write order -- so the result is simply
    the last `right` seen. When the channel is empty (first write, e.g. a
    state-only submit or graph input), it seeds with the first value and
    never calls this at all.
    """
    return right
