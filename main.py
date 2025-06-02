#!/usr/bin/env uv run python
from dotenv import load_dotenv


from langgraph.graph.graph import CompiledGraph
from langgraph.prebuilt import create_react_agent


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


def get_agent() -> CompiledGraph:
    agent = create_react_agent(
        model="claude-sonnet-4-20250514",
        tools=[get_weather],
        prompt="You are a helpful assistant",
    )

    return agent


def main():
    load_dotenv()

    agent = get_agent()
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
    )

    print(result)


if __name__ == "__main__":
    main()
