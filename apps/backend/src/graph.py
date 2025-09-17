#!/usr/bin/env uv run python
import asyncio
import os

from typing import Sequence

from asgiref.sync import sync_to_async

import django
from django.db import close_old_connections

from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_app.settings")
django.setup()

# Needs to be imported _after_ Django setup.
from weather.models import Locality  # noqa: E402

SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


async def aclose_old_connections():
    return await sync_to_async(close_old_connections)()


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
    await aclose_old_connections()
    locality = await Locality.objects.filter(name__icontains=city).afirst()
    await aclose_old_connections()

    if locality:
        return f"The weather in {city} is: {locality.get_weather()}"

    return f"No information found on {city}"


def get_model() -> BaseChatModel:
    model = init_chat_model("claude-3-5-haiku-latest", temperature=0.9)
    return model


def get_prompt(state: AgentState, config: RunnableConfig) -> Sequence[BaseMessage]:
    assert "configurable" in config
    assert isinstance(state["messages"], list)

    template = get_prompt_template()

    return (
        template.format_messages(user_name=config["configurable"].get("user_name"))
        + state["messages"]
    )


def make_graph(config: RunnableConfig) -> CompiledStateGraph:
    model = get_model()
    checkpointer = get_checkpointer()

    agent = create_react_agent(
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
