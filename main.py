#!/usr/bin/env uv run python
import asyncio

from dotenv import load_dotenv

from langchain.chat_models import init_chat_model

from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import AnyMessage, BaseMessage
from langchain_core.runnables import RunnableConfig

from langgraph.graph.graph import CompiledGraph
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Checkpointer


def get_checkpointer() -> Checkpointer:
    checkpointer = InMemorySaver()
    return checkpointer


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


def get_model() -> BaseChatModel:
    model = init_chat_model("claude-3-5-haiku-latest", temperature=0.9)
    return model


def get_prompt(state: AgentState, config: RunnableConfig) -> list[AnyMessage]:
    user_name = config["configurable"].get("user_name")
    system_msg = f"You are a helpful assistant. Address the user as {user_name}."
    return [{"role": "system", "content": system_msg}] + state["messages"]


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

    # last_message = "What's up?\n"

    while True:
        user_input = input("")

        async for chunk, metadata in agent.astream(
            {"messages": [{"role": "user", "content": user_input}]},
            config,
            stream_mode="messages",
        ):
            assert isinstance(chunk, BaseMessage)

            print(chunk.text(), end="")
            # chunk = (
            #     AIMessageChunk(
            #         content="",
            #         additional_kwargs={},
            #         response_metadata={
            #             "stop_reason": "end_turn",
            #             "stop_sequence": None,
            #         },
            #         id="run--60a1ec70-3d15-4762-b064-5e9aef0eba7d",
            #         usage_metadata={
            #             "input_tokens": 0,
            #             "output_tokens": 24,
            #             "total_tokens": 24,
            #         },
            #     ),
            #     {
            #         "thread_id": "1",
            #         "langgraph_step": 1,
            #         "langgraph_node": "agent",
            #         "langgraph_triggers": ("branch:to:agent",),
            #         "langgraph_path": ("__pregel_pull", "agent"),
            #         "langgraph_checkpoint_ns": "agent:a185512b-f58c-8d34-5f72-5b9e2c133a6c",
            #         "checkpoint_ns": "agent:a185512b-f58c-8d34-5f72-5b9e2c133a6c",
            #         "ls_provider": "anthropic",
            #         "ls_model_name": "claude-3-5-haiku-latest",
            #         "ls_model_type": "chat",
            #         "ls_temperature": 0.9,
            #         "ls_max_tokens": 1024,
            #     },
            # )


if __name__ == "__main__":
    asyncio.run(main())
