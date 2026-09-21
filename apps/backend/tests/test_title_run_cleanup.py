"""Characterize Aegra's stateless wait cleanup, without a database or model.

The disconnect case records the upstream behavior behind PR #288's leaked
title threads; it does not assert that retaining those threads is desirable.
"""

from collections.abc import AsyncGenerator
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from aegra_api.api import stateless_runs
from aegra_api.models import RunCreate, User
from fastapi.responses import StreamingResponse

from .conftest import DEFAULT_BASE_URL, ProviderCase


@pytest.fixture(scope="module")
def provider_case() -> ProviderCase:
    return ProviderCase(mock_base_url=DEFAULT_BASE_URL)


@pytest.fixture
def chat_model() -> None:
    return None


@pytest.mark.parametrize("disconnect", [False, True], ids=["complete", "disconnect"])
async def test_stateless_title_wait_cleanup(monkeypatch, disconnect):
    thread_id = UUID("00000000-0000-0000-0000-000000000001")
    user = User(identity="title-cleanup-test-user")
    request = RunCreate.model_validate(
        {
            "assistant_id": "title",
            "input": {
                "messages": [
                    {"type": "human", "content": "Help me plan a trip to Paris"},
                    {"type": "ai", "content": "Start with the museums."},
                ]
            },
        }
    )
    closed = False

    async def body() -> AsyncGenerator[bytes, None]:
        nonlocal closed
        try:
            yield b"\n"
            yield b'{"title":"Paris Trip"}'
        finally:
            closed = True

    wait = AsyncMock(
        return_value=StreamingResponse(body(), media_type="application/json")
    )
    delete = AsyncMock()
    monkeypatch.setattr(stateless_runs, "uuid4", lambda: thread_id)
    monkeypatch.setattr(stateless_runs, "wait_for_run", wait)
    monkeypatch.setattr(stateless_runs, "delete_thread_by_id", delete)

    response = await stateless_runs.stateless_wait_for_run(request, user)
    iterator = cast(AsyncGenerator[bytes, None], response.body_iterator)
    try:
        assert await anext(iterator) == b"\n"
        delete.assert_not_awaited()
        if disconnect:
            # Close after a heartbeat, before the final result is consumed.
            await iterator.aclose()
            delete.assert_not_awaited()
        else:
            assert [chunk async for chunk in iterator] == [b'{"title":"Paris Trip"}']
            delete.assert_awaited_once_with(str(thread_id), user.identity)
        assert closed
        wait.assert_awaited_once_with(str(thread_id), request, user)
    finally:
        await iterator.aclose()
