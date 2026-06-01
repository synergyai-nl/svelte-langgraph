from collections.abc import Sequence
from typing import TypedDict

from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, START, END
from langgraph.graph.state import CompiledStateGraph
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer

from .models import get_chat_model

SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


class AgentState(TypedDict):
    messages: list[BaseMessage]


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
        template.format_messages(
            user_name=config["configurable"].get("user_name")
        )
        + state["messages"]
    )


async def agent_node(
    state: AgentState,
    config: RunnableConfig,
) -> AgentState:
    model = get_chat_model()

    messages = get_prompt(state, config)

    response = await model.ainvoke(
        messages,
        config=config,
    )

    return {
        "messages": state["messages"] + [response]
    }


def make_graph(
    config: RunnableConfig,
) -> CompiledStateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("agent", agent_node)

    graph.add_edge(START, "agent")
    graph.add_edge("agent", END)

    return graph.compile(
        checkpointer=get_checkpointer(),
    )
