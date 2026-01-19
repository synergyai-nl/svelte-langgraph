import asyncio
import random
from typing import Callable, Sequence


async def get_weather(city: str) -> str:
    """Get weather for a given city."""
    await asyncio.sleep(random.randint(1, 10))

    return f"It's always sunny in {city}!"


def get_tools() -> Sequence[Callable]:
    return [get_weather]
