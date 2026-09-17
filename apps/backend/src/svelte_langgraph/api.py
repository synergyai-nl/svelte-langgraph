"""Request/response title generation without persisted runs or threads."""

from typing import Annotated, Literal

from aegra_api.core.auth_deps import require_auth
from fastapi import Depends, FastAPI
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from pydantic import BaseModel, Field

from svelte_langgraph.title import (
    TITLE_CONVERSATION_MAX_TURNS,
    TitleOutputState,
    generate_title,
)

app = FastAPI()


class TitleMessage(BaseModel):
    type: Literal["human", "ai"]
    content: str


class TitleRequest(BaseModel):
    messages: Annotated[
        list[TitleMessage], Field(min_length=1, max_length=TITLE_CONVERSATION_MAX_TURNS)
    ]


@app.post("/titles", dependencies=[Depends(require_auth)])
async def create_title(request: TitleRequest) -> TitleOutputState:
    messages: list[AnyMessage] = [
        HumanMessage(content=message.content)
        if message.type == "human"
        else AIMessage(content=message.content)
        for message in request.messages
    ]
    return await generate_title({"messages": messages})
