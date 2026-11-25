"""Startup check that Aegra loaded this project's auth object."""

from aegra_api.core.auth_middleware import get_auth_instance

from .handlers import auth


def check_auth_loaded() -> None:
    """Raise unless Aegra loaded this project's `Auth` object.

    Aegra 0.12 stops at startup when `auth.path` fails to load. It still
    starts, serving every request as `anonymous`, when the config has no
    `auth.path`, and it accepts any other `Auth` object `auth.path` names.
    In 0.12 and earlier, `AUTH_TYPE` changes neither.

    Workaround for Aegra <= 0.12: simplify once aegra/aegra#775 ships (see
    #440). With #775, `AUTH_TYPE=custom` refuses to start without `auth.path`,
    and this check only adds coverage for a foreign `Auth` object that
    `auth.path` names.

    Call from the `http.app` lifespan; copy it and import your own auth object.
    `auth.path` must be a module path, not a file path: Aegra loads a file path
    as a second copy of the module, so the identity comparison would fail.
    """
    loaded = get_auth_instance()
    if loaded is auth:
        return
    found = "nothing (None)" if loaded is None else f"a different object ({loaded!r})"
    raise RuntimeError(
        "Aegra did not load svelte_langgraph.auth:auth: expected that object, "
        f"found {found}. Without it Aegra serves every request as an anonymous "
        "user. Set `auth.path` to `svelte_langgraph.auth:auth` in the Aegra "
        "config (aegra.json, or the file AEGRA_CONFIG points at)."
    )
