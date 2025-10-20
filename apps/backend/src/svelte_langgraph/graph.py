import asyncio
import random
from typing import Sequence

from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph.state import CompiledStateGraph
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState

from .models import get_chat_model

SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


def get_prompt_template() -> ChatPromptTemplate:
    return ChatPromptTemplate(
        [
            ("system", SYSTEM_PROMPT),
            ("ai", INITIAL_MESSAGE),
        ]
    )


def get_checkpointer() -> Checkpointer:
    checkpointer = InMemorySaver()
    return checkpointer


async def get_weather(city: str) -> str:
    """Get weather for a given city."""
    await asyncio.sleep(random.randint(1, 10))

    return f"It's always sunny in {city}!"


def get_prompt(state: AgentState, config: RunnableConfig) -> Sequence[BaseMessage]:
    assert "configurable" in config
    assert isinstance(state["messages"], list)

    template = get_prompt_template()

    return (
        template.format_messages(user_name=config["configurable"].get("user_name"))
        + state["messages"]
    )


def make_graph(config: RunnableConfig) -> CompiledStateGraph:
    model = get_chat_model()
    checkpointer = get_checkpointer()

    agent = create_react_agent(
        model=model,
        tools=[get_weather],
        prompt=get_prompt,  # type: ignore[arg-type]
        checkpointer=checkpointer,
    )

    return agent
