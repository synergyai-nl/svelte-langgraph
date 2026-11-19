"""The backend refuses to start when Aegra did not load our auth module."""

from pathlib import Path

import pytest
from aegra_api.core import auth_middleware
from aegra_api.core.auth_middleware import LangGraphAuthBackend
from fastapi.testclient import TestClient
from langgraph_sdk import Auth

from svelte_langgraph import http
from svelte_langgraph.auth import auth, startup
from tests.conftest import PROVIDER_CASES

BACKEND_DIR = Path(__file__).resolve().parents[1]


# Nothing here touches a chat model: opt out of the root conftest's provider matrix.
@pytest.fixture(scope="module")
def provider_case():
    return PROVIDER_CASES[0]


@pytest.fixture
def chat_model():
    return None


def use_auth_instance(monkeypatch, instance):
    backend = object.__new__(LangGraphAuthBackend)
    backend.auth_instance = instance
    monkeypatch.setattr(auth_middleware, "get_auth_backend", lambda: backend)


def test_passes_with_our_auth_module(monkeypatch):
    use_auth_instance(monkeypatch, auth)
    startup.check_auth_loaded()


def test_raises_when_no_auth_module_loaded(monkeypatch):
    use_auth_instance(monkeypatch, None)
    with pytest.raises(RuntimeError, match=r"found nothing \(None\)"):
        startup.check_auth_loaded()


def test_raises_for_a_foreign_auth_instance(monkeypatch):
    use_auth_instance(monkeypatch, Auth())
    with pytest.raises(RuntimeError, match="a different object"):
        startup.check_auth_loaded()


def test_startup_is_aborted_without_our_auth_module(monkeypatch):
    use_auth_instance(monkeypatch, None)
    with pytest.raises(RuntimeError, match="auth.path"):
        with TestClient(http.app):
            pass


def test_startup_succeeds_with_our_auth_module(monkeypatch):
    use_auth_instance(monkeypatch, auth)
    with TestClient(http.app):
        pass


def test_aegra_loads_the_same_object_from_the_repo_config(monkeypatch):
    """The identity check only works if Aegra's own loader hands back our
    object. Resolve the repo's aegra.json the way a real start does."""
    monkeypatch.chdir(BACKEND_DIR)
    monkeypatch.setenv("AEGRA_CONFIG", str(BACKEND_DIR / "aegra.json"))
    auth_middleware.get_auth_backend.cache_clear()
    try:
        assert auth_middleware.get_auth_instance() is auth
    finally:
        auth_middleware.get_auth_backend.cache_clear()
