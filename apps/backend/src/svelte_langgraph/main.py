#!/usr/bin/env uv run python

import asyncio
import uuid
from dotenv import load_dotenv

from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from svelte_langgraph.graph import make_graph, INITIAL_MESSAGE
from svelte_langgraph.tracing import get_run_callbacks


async def main():
    load_dotenv()

    config = RunnableConfig(
        configurable={
            "thread_id": "1",
        },
        # A trace id has to be a 32-char hex string; the CLI has no server-issued
        # run id, so mint one per session.
        callbacks=get_run_callbacks(uuid.uuid4().hex),
    )

    agent = make_graph(config).copy(update={"checkpointer": InMemorySaver()})

    user_input = input(f"{INITIAL_MESSAGE}\n")

    while True:
        async for chunk, metadata in agent.astream(
            {"messages": [{"role": "user", "content": user_input}]},
            config,
            stream_mode="messages",
        ):
            assert isinstance(chunk, BaseMessage)

            print(chunk.text, end="")

        user_input = input("\n")


if __name__ == "__main__":
    asyncio.run(main())
