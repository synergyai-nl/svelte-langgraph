"""Opt out of the provider matrix the root conftest applies to every test.

That conftest fans tests out across four provider cases and four model names
through an autouse env fixture, which is what the graph tests need. Nothing
here touches a chat model, so pinning both parameters to a single value keeps
this suite at one run per test instead of sixteen.
"""

import pytest

from tests.conftest import PROVIDER_CASES

BASE_URL = "https://langfuse.test"


@pytest.fixture(scope="module")
def provider_case():
    return PROVIDER_CASES[0]


@pytest.fixture
def chat_model():
    return None


@pytest.fixture
def langfuse_env(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", BASE_URL)
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")


@pytest.fixture
def no_langfuse_env(monkeypatch):
    for key in ("LANGFUSE_BASE_URL", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture(autouse=True)
def instant_retries(monkeypatch):
    """Keep the retry *count* but drop the waits, so the suite doesn't spend
    real seconds sleeping through the backoff."""
    from svelte_langgraph import tracing

    monkeypatch.setattr(tracing, "_RETRY_DELAYS", (0.0,) * len(tracing._RETRY_DELAYS))


@pytest.fixture
def client():
    """A TestClient whose requests are already authenticated.

    /feedback declares `Depends(require_auth)`, which would otherwise reach the
    real OIDC backend. Overriding the dependency stands in for a valid token
    without pretending to validate one -- see test_routes.py for the case that
    exercises the unauthenticated path.
    """
    from fastapi.testclient import TestClient

    from aegra_api.core.auth_deps import require_auth
    from aegra_api.models.auth import User

    from svelte_langgraph.routes import app

    app.dependency_overrides[require_auth] = lambda: User(
        identity="test-user", display_name="test-user", is_authenticated=True
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
