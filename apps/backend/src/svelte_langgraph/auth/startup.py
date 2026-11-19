"""Startup check that Aegra loaded this project's auth object."""

from aegra_api.core.auth_middleware import get_auth_instance

from .handlers import auth


def check_auth_loaded() -> None:
    """Raise unless Aegra loaded this project's auth module.

    When the module fails to load (a wrong `auth.path`, an import error), Aegra
    logs a warning and serves every request as an anonymous user. The
    `AUTH_TYPE` setting does not change that. Failing at startup is the guard.

    Copy this into your own `http.app` and import your own auth object.
    """
    loaded = get_auth_instance()
    if loaded is auth:
        return
    found = "nothing (None)" if loaded is None else f"a different object ({loaded!r})"
    raise RuntimeError(
        "Aegra did not load svelte_langgraph.auth.auth: expected that object, "
        f"found {found}. Without it every request would be served as an "
        "anonymous user. Check `auth.path` in the Aegra config (aegra.json, or "
        "the file AEGRA_CONFIG points at) and the import errors logged above."
    )
