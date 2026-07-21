import logging
from collections.abc import Sequence
from typing import Literal

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer

from .models import get_chat_model
from .tools import VALID_PHASES, get_tools

logger = logging.getLogger(__name__)


class AgentExtendedState(AgentState):
    phase: Literal["research", "draft", "review"]


SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


def get_prompt_template() -> ChatPromptTemplate:
    return ChatPromptTemplate(
        [
            ("system", SYSTEM_PROMPT),
            ("system", "Current phase: {phase}"),
            ("ai", INITIAL_MESSAGE),
        ]
    )


def get_checkpointer() -> Checkpointer:
    checkpointer = InMemorySaver()
    return checkpointer


def get_prompt(
    state: AgentExtendedState, config: RunnableConfig
) -> Sequence[BaseMessage]:
    assert "configurable" in config
    assert isinstance(state["messages"], list)

    template = get_prompt_template()
    phase = state.get("phase") or "research"

    return (
        template.format_messages(
            user_name=config["configurable"].get("user_name"),
            phase=phase,
        )
        + state["messages"]
    )


def _entry_node(state: AgentExtendedState) -> dict:
    """Normalize phase before routing.

    Invalid values are coerced to the default rather than rejected: the input
    is checkpointed before this node runs, so raising here would leave the bad
    value committed to thread state and every subsequent run would fail on it.
    Strict validation lives in the change_phase tool, where a bad LLM argument
    becomes a recoverable ToolMessage error instead of a failed run.
    """
    phase = state.get("phase") or "research"
    if phase not in VALID_PHASES:
        logger.warning("Coercing invalid phase %r to 'research'", phase)
        phase = "research"
    return {"phase": phase}


def _route_after_entry(state: AgentExtendedState, config: RunnableConfig) -> str:
    """Route to agent if last message is from user; otherwise END (state-only submit).

    A field-only submit (`stateSync`'s `field.set()`) never adds a message, but
    accumulated *checkpoint* state can still end in a HumanMessage left over from
    a prior run that was cancelled or failed before the agent produced an AI
    reply (the human message is committed by the `entry` superstep regardless).
    Looking only at `state["messages"]` can't tell that apart from a genuine new
    submission, so it would wrongly re-run the agent and regenerate an answer.

    The frontend marks a state-only submit explicitly via
    `configurable.state_only_submit`, passed through `RunnableConfig` rather than
    graph state so it's per-invocation and never persisted to the checkpoint.
    """
    if config.get("configurable", {}).get("state_only_submit"):
        return END

    messages = state.get("messages", [])
    if messages and isinstance(messages[-1], HumanMessage):
        return "agent"
    return END


def make_graph(
    config: RunnableConfig,
) -> CompiledStateGraph:
    model = get_chat_model()

    # checkpointer=False: inherited subgraph checkpoints would replay cached
    # answers on regenerate (see test_regenerate_reexecutes_model).
    inner_agent = create_react_agent(
        model=model,
        tools=get_tools(),
        prompt=get_prompt,  # type: ignore reportArgumentType
        state_schema=AgentExtendedState,
        checkpointer=False,
    )

    outer = StateGraph(AgentExtendedState)
    outer.add_node("entry", _entry_node)
    outer.add_node("agent", inner_agent)
    outer.add_edge(START, "entry")
    outer.add_conditional_edges(
        "entry", _route_after_entry, {"agent": "agent", END: END}
    )
    outer.add_edge("agent", END)

    return outer.compile(checkpointer=get_checkpointer())
