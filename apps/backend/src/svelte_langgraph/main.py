#!/usr/bin/env uv run python

import asyncio
from dotenv import load_dotenv

from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig

from svelte_langgraph.graph import make_graph, INITIAL_MESSAGE


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
