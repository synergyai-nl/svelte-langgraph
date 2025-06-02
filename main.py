#!/usr/bin/env uv run python
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model

from langchain.chat_models.base import BaseChatModel
from langchain_core.messages import AnyMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.graph import CompiledGraph
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


def get_model() -> BaseChatModel:
    model = init_chat_model("claude-sonnet-4-20250514", temperature=0.9)
    return model


def get_prompt(state: AgentState, config: RunnableConfig) -> list[AnyMessage]:
    user_name = config["configurable"].get("user_name")
    system_msg = f"You are a helpful assistant. Address the user as {user_name}."
    return [{"role": "system", "content": system_msg}] + state["messages"]


def get_agent() -> CompiledGraph:
    model = get_model()

    agent = create_react_agent(
        model=model,
        tools=[get_weather],
        prompt=get_prompt,
    )

    return agent


def main():
    load_dotenv()

    agent = get_agent()
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
        config={"configurable": {"user_name": "John Smith"}},
    )

    print(result)


if __name__ == "__main__":
    main()
