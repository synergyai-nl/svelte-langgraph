"""The auth handler rejects client run input it does not trust.

Covers `validate_run_input`, the handler's return per event, the user's name
from the access token, and the graph prompt reading that name server-side.
"""

from unittest.mock import AsyncMock, patch

import pytest
from aegra_api.core import auth_handlers
from aegra_api.core.auth_handlers import build_auth_context, handle_event
from aegra_api.models import RunCreate
from aegra_api.models.assistants import AssistantCreate
from aegra_api.models.auth import User
from aegra_api.models.crons import CronCreate, CronUpdate
from aegra_api.services.run_preparation import _apply_create_run_auth
from fastapi import HTTPException
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from langgraph_sdk import Auth

from svelte_langgraph.auth import handlers, oidc, run_input
from svelte_langgraph.graph import get_prompt, get_user_name
from tests.conftest import PROVIDER_CASES, make_completion_response

USER_ID = "oidc|user-1"
CLIENT_VALUE = "client-supplied-value"


# Nothing here depends on the chat provider: opt out of the root conftest's provider matrix.
@pytest.fixture(scope="module")
def provider_case():
    return PROVIDER_CASES[0]


@pytest.fixture
def chat_model():
    return None


def run_create(**fields) -> RunCreate:
    return RunCreate.model_validate(fields)


def rejected(value: dict) -> str:
    """Validate `value`, expect a 422, and return its detail."""
    with pytest.raises(Auth.exceptions.HTTPException) as caught:
        run_input.validate_run_input(value)
    assert caught.value.status_code == 422
    assert CLIENT_VALUE not in str(caught.value.detail)
    return str(caught.value.detail)


def configurable(**keys) -> dict:
    return {"config": {"configurable": keys}}


# --- validate_run_input ------------------------------------------------------


@pytest.mark.parametrize(
    "value",
    [
        pytest.param({}, id="absent"),
        pytest.param(
            {"config": None, "context": None, "checkpoint": None}, id="all-none"
        ),
        pytest.param({"config": {}, "context": {}}, id="all-empty"),
        pytest.param(
            {"config": {"configurable": {}, "tags": [], "metadata": {}}},
            id="empty-defaults",
        ),
        pytest.param(configurable(state_only_submit=True), id="state-only-submit"),
        pytest.param(configurable(state_only_submit=False), id="state-only-false"),
        pytest.param(
            {
                "checkpoint": {
                    "thread_id": "t",
                    "checkpoint_ns": "",
                    "checkpoint_id": "c",
                    "checkpoint_map": None,
                }
            },
            id="checkpoint-address",
        ),
    ],
)
def test_accepts_trusted_input(value):
    run_input.validate_run_input(value)


@pytest.mark.parametrize(
    "request_model",
    [
        pytest.param(
            run_create(assistant_id="chat", input={"messages": []}), id="turn"
        ),
        pytest.param(
            run_create(
                assistant_id="chat",
                input={"messages": []},
                checkpoint={"checkpoint_ns": "", "checkpoint_id": "c"},
            ),
            id="edit",
        ),
        pytest.param(
            run_create(
                assistant_id="chat",
                checkpoint={"checkpoint_ns": "", "checkpoint_id": "c"},
            ),
            id="regenerate",
        ),
        pytest.param(
            run_create(
                assistant_id="chat",
                input={"phase": "draft"},
                config={"configurable": {"state_only_submit": True}},
            ),
            id="state-only-submit",
        ),
        pytest.param(
            run_create(assistant_id="chat", command={"resume": "yes"}),
            id="resume",
        ),
    ],
)
def test_accepts_what_aegra_dumps_for_frontend_runs(request_model):
    run_input.validate_run_input({**request_model.model_dump(), "thread_id": "t"})


@pytest.mark.parametrize(
    "key",
    ["user_id", "user_display_name", "langgraph_auth_user", "user_name", "unknown"],
)
def test_rejects_configurable_keys_not_allowlisted(key):
    detail = rejected(configurable(**{key: CLIENT_VALUE}))
    assert f"config.configurable.{key}" in detail


@pytest.mark.parametrize("value", ["true", 1, None])
def test_rejects_state_only_submit_of_the_wrong_type(value):
    detail = rejected(configurable(state_only_submit=value))
    assert "config.configurable.state_only_submit must be of type bool" in detail


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("tags", [CLIENT_VALUE]),
        ("metadata", {"k": CLIENT_VALUE}),
        ("recursion_limit", 5),
    ],
)
def test_rejects_non_empty_top_level_config_keys(key, value):
    assert f"config.{key}" in rejected({"config": {key: value}})


@pytest.mark.parametrize("context", [{"user_id": CLIENT_VALUE}, CLIENT_VALUE])
def test_rejects_a_non_empty_context(context):
    assert "context is not accepted" in rejected({"context": context})


@pytest.mark.parametrize("field", ["config", "checkpoint"])
def test_rejects_non_object_shapes(field):
    assert f"{field} must be an object" in rejected({field: CLIENT_VALUE})


def test_rejects_a_non_object_configurable():
    assert "config.configurable must be an object" in rejected(
        {"config": {"configurable": [CLIENT_VALUE]}}
    )


def test_rejects_unknown_checkpoint_keys():
    detail = rejected({"checkpoint": {"checkpoint_id": "c", "user_id": CLIENT_VALUE}})
    assert "checkpoint.user_id" in detail


@pytest.mark.parametrize("webhook", [None, ""])
def test_accepts_no_webhook(webhook):
    """Aegra treats an empty webhook as none and never calls it."""
    run_input.validate_run_input({"webhook": webhook})


@pytest.mark.parametrize(
    "webhook", ["https://example.com/hook", "not a url", {"url": CLIENT_VALUE}]
)
def test_rejects_a_webhook(webhook):
    assert rejected({"webhook": webhook}) == "webhook is not accepted."


@pytest.mark.parametrize(
    "value",
    [
        pytest.param(
            CronCreate.model_validate(
                {
                    "assistant_id": "chat",
                    "schedule": "0 * * * *",
                    "input": {},
                    "webhook": "https://example.com/hook",
                }
            ).model_dump(),
            id="cron-create",
        ),
        pytest.param(
            {
                "cron_id": "c",
                **CronUpdate.model_validate(
                    {"webhook": "https://example.com/hook"}
                ).model_dump(exclude_none=True),
            },
            id="cron-update",
        ),
    ],
)
def test_rejects_the_webhook_of_a_cron(value):
    """Aegra hands the cron events the webhook under the same key."""
    assert rejected(value) == "webhook is not accepted."


@pytest.mark.parametrize(
    "command",
    [
        {"resume": "yes"},
        {"resume": None},
        {"resume": "yes", "update": None, "goto": None},
        {"resume": "yes", "update": {}, "goto": []},
    ],
)
def test_accepts_a_resume_command(command):
    run_input.validate_run_input({"command": command})


@pytest.mark.parametrize(
    ("command", "detail"),
    [
        ({"update": {"phase": "draft"}}, "command.update is not accepted."),
        (
            {"resume": "yes", "update": [["phase", "draft"]]},
            "command.update is not accepted.",
        ),
        ({"goto": "model"}, "command.goto is not accepted."),
        (
            {"resume": "yes", "goto": [{"node": "tools", "input": {}}]},
            "command.goto is not accepted.",
        ),
        ({"goto": ""}, "command.goto is not accepted."),
        ({"resume": "yes", "user_id": CLIENT_VALUE}, "command.user_id"),
    ],
)
def test_rejects_command_keys_beyond_resume(command, detail):
    assert detail in rejected({"command": command})


def test_rejects_a_non_object_command():
    assert "command must be an object" in rejected({"command": [CLIENT_VALUE]})


def test_names_long_keys_cut_short():
    detail = rejected(configurable(**{"k" * 500: True}))
    assert "k" * 64 in detail
    assert "k" * 65 not in detail


# --- add_owner -----------------------------------------------------------------


def ctx(resource: str, action: str) -> Auth.types.AuthContext:
    """The context Aegra hands the handler for this event."""
    user = User(identity=USER_ID)
    return build_auth_context(user, resource, action).to_langgraph_context()


async def test_run_create_returns_owner_and_server_context():
    value = {"config": {}, "context": {}, "metadata": None}
    result = await handlers.add_owner(ctx("threads", "create_run"), value)
    assert result == {"owner": USER_ID, "context": {"user_id": USER_ID}}
    assert value["metadata"] == {"owner": USER_ID}


@pytest.mark.parametrize(
    ("resource", "action"),
    [
        ("threads", "create"),
        ("threads", "read"),
        ("threads", "update"),
        ("threads", "search"),
        ("assistants", "create"),
        ("assistants", "read"),
        ("assistants", "update"),
        ("assistants", "search"),
        ("crons", "create"),
        ("store", "put"),
    ],
)
async def test_other_events_return_only_the_owner_filter(resource, action):
    value: dict = {"metadata": {"title": "kept"}}
    result = await handlers.add_owner(ctx(resource, action), value)
    assert result == {"owner": USER_ID}
    assert value["metadata"] == {"title": "kept", "owner": USER_ID}


@pytest.mark.parametrize(
    ("resource", "action", "value"),
    [
        ("threads", "create_run", configurable(user_id=CLIENT_VALUE)),
        ("assistants", "create", {"config": {}, "context": {"user_id": CLIENT_VALUE}}),
        ("assistants", "update", configurable(user_display_name=CLIENT_VALUE)),
        ("crons", "create", configurable(user_id=CLIENT_VALUE)),
        ("crons", "update", {"context": {"user_id": CLIENT_VALUE}}),
        ("crons", "update", {"cron_id": "c", "webhook": "https://example.com/hook"}),
    ],
)
async def test_handler_rejects_untrusted_input(resource, action, value):
    with pytest.raises(Auth.exceptions.HTTPException) as caught:
        await handlers.add_owner(ctx(resource, action), value)
    assert caught.value.status_code == 422


async def test_handler_does_not_validate_other_events():
    """Thread metadata, for example, is not run input."""
    value = {"config": {"tags": ["x"]}, "context": {"a": 1}}
    assert await handlers.add_owner(ctx("threads", "update"), value) == {
        "owner": USER_ID
    }


# --- through Aegra's own dispatch ----------------------------------------------


@pytest.fixture
def aegra_uses_our_auth(monkeypatch):
    monkeypatch.setattr(auth_handlers, "get_auth_instance", lambda: handlers.auth)


async def test_aegra_run_create_merges_the_server_context(aegra_uses_our_auth):
    request = run_create(
        assistant_id="chat",
        input={"phase": "draft"},
        config={"configurable": {"state_only_submit": True}},
    )
    await _apply_create_run_auth(User(identity=USER_ID), "thread-1", request)
    assert request.context == {"user_id": USER_ID}
    assert request.config == {"configurable": {"state_only_submit": True}}


async def test_aegra_run_create_rejects_untrusted_input(aegra_uses_our_auth):
    request = run_create(
        assistant_id="chat",
        input={"messages": []},
        config={"configurable": {"user_id": CLIENT_VALUE}},
    )
    with pytest.raises(HTTPException) as caught:
        await _apply_create_run_auth(User(identity=USER_ID), "thread-1", request)
    assert caught.value.status_code == 422
    assert "config.configurable.user_id" in caught.value.detail


async def test_aegra_run_create_rejects_a_webhook(aegra_uses_our_auth):
    request = run_create(
        assistant_id="chat", input={}, webhook="https://example.com/hook"
    )
    with pytest.raises(HTTPException) as caught:
        await _apply_create_run_auth(User(identity=USER_ID), "thread-1", request)
    assert caught.value.status_code == 422
    assert caught.value.detail == "webhook is not accepted."


async def test_aegra_run_create_rejects_a_command_update(aegra_uses_our_auth):
    request = run_create(
        assistant_id="chat", command={"resume": "x", "update": {"phase": "draft"}}
    )
    with pytest.raises(HTTPException) as caught:
        await _apply_create_run_auth(User(identity=USER_ID), "thread-1", request)
    assert caught.value.status_code == 422
    assert caught.value.detail == "command.update is not accepted."


async def test_aegra_assistant_create_rejects_a_context(aegra_uses_our_auth):
    value = AssistantCreate.model_validate(
        {"graph_id": "chat", "context": {"user_id": CLIENT_VALUE}}
    ).model_dump()
    with pytest.raises(HTTPException) as caught:
        await handle_event(
            build_auth_context(User(identity=USER_ID), "assistants", "create"), value
        )
    assert caught.value.status_code == 422


# --- the user's name -------------------------------------------------------------


@pytest.mark.parametrize(
    ("claims", "display_name"),
    [
        ({"name": "Alice Example"}, "Alice Example"),
        ({}, None),
        ({"name": ""}, None),
        ({"name": "  "}, None),
        ({"name": ["Alice"]}, None),
    ],
)
async def test_display_name_comes_from_the_name_claim(claims, display_name):
    with patch.object(
        oidc, "_validate_token", AsyncMock(return_value={"sub": USER_ID, **claims})
    ):
        user = await handlers.get_current_user({"authorization": "Bearer token"})
    assert user["identity"] == USER_ID
    assert user.get("display_name") == display_name


def prompt_text(configurable: dict) -> str:
    config = RunnableConfig(configurable={"thread_id": "t", **configurable})
    messages = get_prompt({"messages": [], "phase": "draft"}, config)  # type: ignore[arg-type]
    assert isinstance(messages[0], SystemMessage)
    return str(messages[0].content)


def test_prompt_addresses_the_user_by_the_token_name():
    user = User(identity=USER_ID, display_name="Alice")
    text = prompt_text({"langgraph_auth_user": user, "user_name": "Mallory"})
    assert "Address the user as Alice." in text
    assert "Mallory" not in text


def test_prompt_ignores_a_client_user_name():
    text = prompt_text({"user_name": "Mallory"})
    assert "Mallory" not in text
    assert "Address the user" not in text


@pytest.mark.parametrize("display_name", [None, USER_ID, ""])
def test_prompt_has_no_name_when_the_token_has_none(display_name):
    user = User(identity=USER_ID, display_name=display_name)
    assert "Address the user" not in prompt_text({"langgraph_auth_user": user})


def test_user_name_reads_a_mapping_user():
    config = RunnableConfig(
        configurable={
            "langgraph_auth_user": {"identity": USER_ID, "display_name": "Bo"}
        }
    )
    assert get_user_name(config) == "Bo"


async def test_graph_accepts_the_server_context(
    agent, thread_config, mock_completion_optional
):
    """Our graph declares no context schema; the stamped context must not break it."""
    result = await agent.ainvoke(
        {"phase": "draft"}, thread_config, context={"user_id": USER_ID}
    )
    assert result["phase"] == "draft"
    assert not mock_completion_optional.called


async def test_command_goto_reaches_the_model_past_phase_gate(
    agent, thread_config, mock_completion_optional
):
    """Why `command` may only carry `resume`.

    phase_gate ends a state-only submit without a model call. A `goto` in the
    run's command schedules the model next to phase_gate, so the model runs
    anyway.
    """
    mock_completion_optional.mock(return_value=make_completion_response("hi"))
    config = RunnableConfig(
        configurable={**thread_config["configurable"], "state_only_submit": True}
    )
    await agent.ainvoke(Command(goto="model"), config)
    assert mock_completion_optional.called
