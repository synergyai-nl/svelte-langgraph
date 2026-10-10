"""Opt out of the provider matrix the root conftest applies to every test.

That conftest fans tests out across four provider cases and four model names
through an autouse env fixture, which is what the graph tests need. Nothing
here touches a chat model, so pinning both parameters to a single value keeps
this suite at one run per test instead of sixteen.
"""

import httpx
import pytest
from aegra_api.core import auth_deps
from aegra_api.core.auth_deps import require_auth
from aegra_api.core.auth_middleware import LangGraphAuthBackend
from aegra_api.models import User
from fastapi.testclient import TestClient

from svelte_langgraph import http
from svelte_langgraph.feedback import views

from tests.conftest import PROVIDER_CASES

BASE_URL = "https://langfuse.test"

# The thread and run the /feedback tests post about.
THREAD_ID = "9a3f9e2e-9b6d-4b7a-8a7b-2a8e9c6f5d31"
RUN_ID = "2762a745-00bb-4933-a51a-eddd65679b75"


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


# Deliberately unlike the display name: a score id read off the wrong User
# field has to miss this.
USER_ID = "oidc|3f2a91c4-owner"
DISPLAY_NAME = "Some Owner"

# A second caller, for the score id having to follow whoever is asking.
OTHER_USER_ID = "oidc|8b7d05e6-other"

MESSAGE_ID = "ai-answer-1"


def ai_message(message_id: str = MESSAGE_ID, run_id: str | None = RUN_ID) -> dict:
    """An AI message as GET /threads/{id}/state serializes it, stamped with its
    producing run unless `run_id` is None (one written before the stamp)."""
    metadata = {"run_id": run_id} if run_id else {}
    return {
        "id": message_id,
        "type": "ai",
        "content": "hi",
        "response_metadata": metadata,
    }


@pytest.fixture
def thread_visible(request):
    """Whether Aegra lets the caller read the thread. Parametrize indirect with
    False to stand in for another user's thread, or one a handler filtered out."""
    return getattr(request, "param", True)


@pytest.fixture
def messages(request):
    """The thread's messages. Default: a question and one stamped answer."""
    return getattr(
        request,
        "param",
        [{"id": "human-1", "type": "human", "content": "hello"}, ai_message()],
    )


class FakeAegra:
    """Aegra's public thread routes, answering as Aegra would for the caller.
    Records each request so tests can check it went out as the caller."""

    def __init__(self, visible: bool, messages: list[dict]):
        self.requests: list[httpx.Request] = []
        self._visible = visible
        self._messages = messages

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path not in (f"/threads/{THREAD_ID}", f"/threads/{THREAD_ID}/state"):
            return httpx.Response(404)
        if not self._visible:
            return httpx.Response(404, json={"detail": "Thread not found"})
        if path.endswith("/state"):
            return httpx.Response(200, json={"values": {"messages": self._messages}})
        return httpx.Response(200, json={"thread_id": THREAD_ID})


@pytest.fixture
def aegra(thread_visible, messages):
    return FakeAegra(thread_visible, messages)


@pytest.fixture
def caller_id(request):
    """Who is asking. Override with
    `@pytest.mark.parametrize("caller_id", [OTHER_USER_ID], indirect=True)`
    to check the query follows the caller rather than a fixed value."""
    return getattr(request, "param", USER_ID)


@pytest.fixture
def authenticated(request):
    """Whether the backend claims the caller is authenticated at all."""
    return getattr(request, "param", True)


@pytest.fixture
def real_auth(monkeypatch):
    """Wire the project's own auth module in, wherever pytest was started from.

    Aegra finds auth by resolving aegra.json relative to the process CWD and
    caches the result for the session (lru_cache on get_auth_backend). Run from
    the repo root it finds nothing, falls back to the anonymous user, and the
    one test that exercises the real require_auth stops testing it.
    """
    from svelte_langgraph.auth import auth

    backend = object.__new__(LangGraphAuthBackend)
    backend.auth_instance = auth
    monkeypatch.setattr(auth_deps, "get_auth_backend", lambda: backend)
    return backend


@pytest.fixture
def client(aegra, caller_id, authenticated):
    """A TestClient that is authenticated, talking to a fake Aegra.

    /feedback depends on `require_auth` and on Aegra's own routes, which would
    otherwise reach the real OIDC issuer and a real Postgres. The case that
    exercises the genuine unauthenticated path lives in test_routes.py.
    """

    async def fake_aegra_client():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(aegra.handle), base_url="http://aegra"
        ) as fake:
            yield fake

    app = http.app
    app.dependency_overrides[require_auth] = lambda: User(
        identity=caller_id, display_name=DISPLAY_NAME, is_authenticated=authenticated
    )
    app.dependency_overrides[views.aegra_client] = fake_aegra_client
    try:
        with TestClient(
            app, headers={"Authorization": "Bearer caller-token"}
        ) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
