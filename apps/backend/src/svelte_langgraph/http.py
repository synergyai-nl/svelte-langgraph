"""The single custom app Aegra mounts.

Aegra takes exactly one `http.app`, so every feature's routes are assembled
here rather than inside whichever feature happened to need an app first. That
keeps the feature modules peers -- feedback has no reason to import titles --
and keeps this composition out of the files upstream edits.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from aegra_api.core.auth_middleware import get_auth_instance
from fastapi import FastAPI

from .api import router as title_router
from .auth import auth
from .feedback.views import router as feedback_router


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


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    check_auth_loaded()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(title_router)
app.include_router(feedback_router)
