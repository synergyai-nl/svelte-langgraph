from collections.abc import Mapping
from typing import Any

from langgraph_sdk import Auth

# --- Client run input --------------------------------------------------------
#
# Run input from the client reaches the graph's RunnableConfig, and through an
# assistant's stored config/context it reaches every run of that assistant.
# Aegra only lets the auth handler reject such input reliably (a raise works on
# every route; rewriting it does not), so anything not listed here is rejected.

# Keys a client may send in `config.configurable`, with the type each must have.
# DOWNSTREAM APPS: this is where you add the configurable keys your own client
# sends. Never add identity keys (`user_id`, a user name, ...): the graph reads
# identity from `langgraph_auth_user`, which Aegra sets from the access token.
ALLOWED_CONFIGURABLE_KEYS: dict[str, type] = {
    # Marks a submit that only writes state fields; see graph.phase_gate.
    "state_only_submit": bool,
}

# Keys of a run's `checkpoint`: the checkpoint address the SDK sends for an
# edit or regenerate. Aegra merges these into `configurable`, so other keys
# would bypass the allowlist above.
ALLOWED_CHECKPOINT_KEYS = frozenset(
    {"thread_id", "checkpoint_ns", "checkpoint_id", "checkpoint_map"}
)

# Keys of a run's `command`. `resume` answers a pending interrupt, and Aegra
# checks that the thread is interrupted. `update` writes state and `goto` runs
# a node of the caller's choice, which skips the decisions graph.phase_gate
# makes; both must be empty. Other keys are rejected.
ALLOWED_COMMAND_KEYS = frozenset({"resume"})
EMPTY_COMMAND_KEYS = frozenset({"update", "goto"})

# Events whose payload carries config/context that ends up in a run.
RUN_INPUT_EVENTS = frozenset(
    {
        ("threads", "create_run"),
        ("assistants", "create"),
        ("assistants", "update"),
        ("crons", "create"),
        ("crons", "update"),
    }
)


def _reject(detail: str) -> Auth.exceptions.HTTPException:
    return Auth.exceptions.HTTPException(status_code=422, detail=detail)


def _key(path: str, key: object) -> str:
    # Name the offending key, cut short; never echo a value.
    return f"{path}.{str(key)[:64]}"


def _is_empty(value: object) -> bool:
    """None and empty containers are the defaults the SDK and Aegra fill in."""
    return value is None or (isinstance(value, (Mapping, list, tuple)) and not value)


def _as_mapping(path: str, value: object) -> Mapping[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise _reject(f"{path} must be an object.")
    return value


def _validate_config(path: str, raw_config: object) -> None:
    config = _as_mapping(path, raw_config)
    for key, item in config.items():
        # Top-level keys (tags, metadata, recursion_limit, ...) are not part
        # of the demo's client contract; their empty defaults pass.
        if key != "configurable" and not _is_empty(item):
            raise _reject(f"{_key(path, key)} is not accepted.")

    configurable_path = f"{path}.configurable"
    configurable = _as_mapping(configurable_path, config.get("configurable"))
    for key, item in configurable.items():
        expected = ALLOWED_CONFIGURABLE_KEYS.get(key)
        if expected is None:
            raise _reject(f"{_key(configurable_path, key)} is not an allowed key.")
        if not isinstance(item, expected):
            raise _reject(
                f"{_key(configurable_path, key)} must be of type {expected.__name__}."
            )


def validate_run_input(value: Mapping[str, Any]) -> None:
    """Reject client run input the server does not trust, with a 422.

    Checks `config` (only allowlisted `configurable` keys, every other key
    empty), `context` and `webhook` (must be empty), the keys of
    `checkpoint`, and `command` (only `resume`). The detail names the
    offending key, never its value.
    """
    _validate_config("config", value.get("config"))

    if not _is_empty(value.get("context")):
        raise _reject("context is not accepted; it must be empty.")

    # This backend turns run webhooks off. Aegra treats "" as no webhook.
    if value.get("webhook") not in (None, ""):
        raise _reject("webhook is not accepted.")

    for key in _as_mapping("checkpoint", value.get("checkpoint")):
        if key not in ALLOWED_CHECKPOINT_KEYS:
            raise _reject(f"{_key('checkpoint', key)} is not an allowed key.")

    for key, item in _as_mapping("command", value.get("command")).items():
        if key in ALLOWED_COMMAND_KEYS:
            continue
        if key in EMPTY_COMMAND_KEYS:
            if not _is_empty(item):
                raise _reject(f"command.{key} is not accepted.")
            continue
        raise _reject(f"{_key('command', key)} is not an allowed key.")
