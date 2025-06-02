#!/usr/bin/env uv run python
import asyncio
from typing import Sequence

from dotenv import load_dotenv

from langchain.chat_models import init_chat_model

from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from langgraph.graph.graph import CompiledGraph
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer

INITIAL_MESSAGE = "Hi, how are you doing?"


def get_checkpointer() -> Checkpointer:
    checkpointer = InMemorySaver()
    return checkpointer


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


def get_model() -> BaseChatModel:
    model = init_chat_model("claude-3-5-haiku-latest", temperature=0.9)
    return model


def get_prompt(state: AgentState, config: RunnableConfig) -> Sequence[BaseMessage]:
    assert "configurable" in config
    user_name = config["configurable"].get("user_name")
    system_msg = f"You are a helpful assistant. Address the user as {user_name}."

    assert isinstance(state["messages"], list)

    return [SystemMessage(system_msg), AIMessage(INITIAL_MESSAGE)] + state["messages"]


def get_agent() -> CompiledGraph:
    model = get_model()
    checkpointer = get_checkpointer()

    agent = create_react_agent(
        model=model, tools=[get_weather], prompt=get_prompt, checkpointer=checkpointer
    )

    return agent


async def main():
    load_dotenv()

    agent = get_agent()

    config = RunnableConfig(configurable={"thread_id": "1"})

    user_input = input(f"{INITIAL_MESSAGE}\n")

    while True:
        async for chunk, metadata in agent.astream(
            {"messages": [{"role": "user", "content": user_input}]},
            config,
            stream_mode="messages",
        ):
            assert isinstance(chunk, BaseMessage)

            print(chunk.text(), end="")

        user_input = input("\n")


if __name__ == "__main__":
    asyncio.run(main())
