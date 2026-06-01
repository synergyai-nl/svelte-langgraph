from collections.abc import Sequence
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import ToolNode
from langgraph.types import Checkpointer

from .models import get_chat_model
from .tools import get_tools
from .tracing import get_tracing_callbacks

SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def get_prompt_template() -> ChatPromptTemplate:
    return ChatPromptTemplate(
        [
            ("system", SYSTEM_PROMPT),
            ("ai", INITIAL_MESSAGE),
        ]
    )


def get_checkpointer() -> Checkpointer:
    return InMemorySaver()


def get_prompt(
    state: AgentState,
    config: RunnableConfig,
) -> Sequence[BaseMessage]:
    assert "configurable" in config

    template = get_prompt_template()

    return (
        template.format_messages(user_name=config["configurable"].get("user_name"))
        + state["messages"]
    )


async def agent_node(
    state: AgentState,
    config: RunnableConfig,
) -> AgentState:
    model = get_chat_model().bind_tools(get_tools())

    messages = get_prompt(state, config)

    response = await model.ainvoke(messages, config=config)

    return {"messages": [response]}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


def make_graph(
    config: RunnableConfig,
) -> CompiledStateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(get_tools()))

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue)
    graph.add_edge("tools", "agent")

    compiled = graph.compile(checkpointer=get_checkpointer())

    callbacks = get_tracing_callbacks()
    if callbacks:
        compiled = compiled.with_config({"callbacks": callbacks})

    return compiled
