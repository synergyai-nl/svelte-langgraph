"""The single custom app Aegra mounts.

Aegra takes exactly one `http.app`, so every feature's routes are assembled
here rather than inside whichever feature happened to need an app first. That
keeps the feature modules peers -- feedback has no reason to import titles --
and keeps this composition out of the files upstream edits.
"""

from fastapi import FastAPI

from .api import router as title_router
from .routes import router as feedback_router

app = FastAPI()
app.include_router(title_router)
app.include_router(feedback_router)
