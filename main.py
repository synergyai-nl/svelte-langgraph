#!/usr/bin/env uv run python
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model

from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import AnyMessage
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


def main():
    load_dotenv()

    agent = get_agent()

    config = RunnableConfig(configurable={"thread_id": "1"})

    sf_response = agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]}, config
    )

    print(sf_response["messages"][-1].content)

    ny_response = agent.invoke(
        {"messages": [{"role": "user", "content": "what about new york?"}]}, config
    )
    print(ny_response["messages"][-1].content)


if __name__ == "__main__":
    main()
