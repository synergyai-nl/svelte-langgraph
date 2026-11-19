"""The backend refuses to start when Aegra did not load our auth module."""

import json
from pathlib import Path

import pytest
from aegra_api.core import auth_middleware
from aegra_api.core.auth_middleware import AuthLoadError, LangGraphAuthBackend
from aegra_api.settings import settings
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


@pytest.fixture(autouse=True)
def _fresh_auth_backend():
    """Aegra caches its auth backend for the process; keep that out of other tests."""
    auth_middleware.get_auth_backend.cache_clear()
    yield
    # Some tests replace the function with a stub; the real one is then untouched.
    clear = getattr(auth_middleware.get_auth_backend, "cache_clear", None)
    if clear:
        clear()


def point_aegra_at(monkeypatch, config_path):
    """`settings` is built once at import, so patch the path on it directly."""
    monkeypatch.setattr(settings.app, "AEGRA_CONFIG", str(config_path))
    auth_middleware.get_auth_backend.cache_clear()


def write_config(tmp_path, **extra):
    config = json.loads((BACKEND_DIR / "aegra.json").read_text())
    config.pop("auth")
    config.update(extra)
    path = tmp_path / "aegra.json"
    path.write_text(json.dumps(config))
    return path


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
    # Entering the client runs the lifespan, which is where the check lives.
    with pytest.raises(RuntimeError, match="auth.path"):
        TestClient(http.app).__enter__()


def test_startup_succeeds_with_our_auth_module(monkeypatch):
    use_auth_instance(monkeypatch, auth)
    with TestClient(http.app) as client:
        assert client.get("/openapi.json").status_code == 200


def test_aegra_loads_the_same_object_from_the_repo_config(monkeypatch):
    """The identity check only works if Aegra's own loader hands back our
    object. Resolve the repo's aegra.json the way a real start does."""
    monkeypatch.chdir(BACKEND_DIR)
    point_aegra_at(monkeypatch, BACKEND_DIR / "aegra.json")
    assert auth_middleware.get_auth_instance() is auth


def test_aegra_refuses_a_broken_auth_path(monkeypatch, tmp_path):
    """Aegra 0.12 itself stops at startup when `auth.path` does not load."""
    path = write_config(tmp_path, auth={"path": "svelte_langgraph.nope:auth"})
    point_aegra_at(monkeypatch, path)
    with pytest.raises(AuthLoadError):
        auth_middleware.get_auth_backend()


def test_a_config_without_auth_is_caught_by_our_check(monkeypatch, tmp_path):
    """Without `auth.path` Aegra starts and serves everyone as `anonymous`, so
    only our own check stops it."""
    point_aegra_at(monkeypatch, write_config(tmp_path))
    assert auth_middleware.get_auth_instance() is None
    with pytest.raises(RuntimeError, match=r"found nothing \(None\)"):
        startup.check_auth_loaded()
