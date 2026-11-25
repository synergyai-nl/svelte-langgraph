"""The single custom app Aegra mounts.

Aegra takes exactly one `http.app`, so every feature's routes are assembled
here rather than inside whichever feature happened to need an app first. That
keeps the feature modules peers -- feedback has no reason to import titles --
and keeps this composition out of the files upstream edits.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import router as title_router
from .auth.startup import check_auth_loaded
from .feedback.views import router as feedback_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Workaround for Aegra <= 0.12: remove or simplify once aegra/aegra#775
    # ships (see #440).
    check_auth_loaded()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(title_router)
app.include_router(feedback_router)
