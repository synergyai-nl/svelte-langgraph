#!/usr/bin/env uv run python
import asyncio
import os
from typing import Sequence

from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph.state import CompiledStateGraph
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer

try:
    from langchain.agents import create_agent, AgentState
except ImportError:
    from langgraph.prebuilt import create_react_agent as create_agent
    from langgraph.prebuilt.chat_agent_executor import AgentState

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


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


def get_model() -> BaseChatModel:
    model_name = os.getenv("CHAT_MODEL_NAME", "claude-3-5-haiku-latest")
    temperature = float(os.getenv("CHAT_MODEL_TEMPERATURE", "0.9"))
    model = init_chat_model(model_name, temperature=temperature)
    return model


def get_prompt(state: AgentState, config: RunnableConfig) -> Sequence[BaseMessage]:
    assert "configurable" in config
    assert isinstance(state["messages"], list)

    template = get_prompt_template()

    prompt_messages = template.format_messages(
        user_name=config["configurable"].get("user_name")
    )
    return list(prompt_messages) + list(state["messages"])


def make_graph(config: RunnableConfig) -> CompiledStateGraph:
    model = get_model()
    checkpointer = get_checkpointer()

    agent = create_agent(
        model=model,
        tools=[get_weather],
        prompt=get_prompt,  # type: ignore reportArgumentType
        checkpointer=checkpointer,
    )

    return agent


async def main():
    load_dotenv()

    config = RunnableConfig(configurable={"thread_id": "1"})

    agent = make_graph(config)

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
