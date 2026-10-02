"""Route registration for the feedback module."""

from fastapi import APIRouter

from .views import feedback

# A router, not an app: Aegra mounts exactly one custom app, and http.py is it.
router = APIRouter()
router.post("/feedback")(feedback)
