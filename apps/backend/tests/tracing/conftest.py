"""Opt out of the provider matrix the root conftest applies to every test.

That conftest fans tests out across four provider cases and four model names
through an autouse env fixture, which is what the graph tests need. Nothing
here touches a chat model, so pinning both parameters to a single value keeps
this suite at one run per test instead of sixteen.
"""

import pytest
from sqlalchemy import Select

from tests.conftest import PROVIDER_CASES

BASE_URL = "https://langfuse.test"

# The run the /feedback tests post about. Lives here rather than in a test
# module because the fixtures below answer ownership questions in terms of it.
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


# Deliberately unlike the display name and unlike anything a stray literal in
# the route would plausibly be: an ownership check that hardcoded an identity,
# or read one off the wrong User field, has to miss this.
USER_ID = "oidc|3f2a91c4-owner"
DISPLAY_NAME = "Some Owner"

# A second caller for the tests that vary who is asking. One hardcoded identity
# cannot satisfy an assertion made against both.
OTHER_USER_ID = "oidc|8b7d05e6-other"


class _StubSession:
    """Stands in for the AsyncSession the ownership check queries.

    `owned` is what `session.scalar()` returns: the run id when the run exists
    and belongs to the caller, None when it does not. The route only asks that
    one question, so distinguishing "no such run" from "someone else's run" is
    the database's job, not this stub's -- both arrive here as None, which is
    also why the route answers 404 to both.
    """

    def __init__(self, owned: str | None):
        self._owned = owned
        self.statement: Select | None = None

    async def scalar(self, statement):
        # Kept so a test can assert what was actually asked. Returning the right
        # answer to the wrong question is the failure mode here: a query filtered
        # on run id alone would satisfy every other test in the file while
        # letting anyone score anyone's run.
        self.statement = statement
        return self._owned

    def compiled_sql(self) -> str:
        assert self.statement is not None, "nothing was queried"
        return str(self.statement.compile(compile_kwargs={"literal_binds": True}))


@pytest.fixture
def run_owner(request):
    """What the ownership query finds: RUN_ID when the caller owns the run.

    Override with `@pytest.mark.parametrize("run_owner", [None], indirect=True)`
    for the run that is missing or belongs to someone else.
    """
    return getattr(request, "param", RUN_ID)


@pytest.fixture
def session(run_owner):
    return _StubSession(run_owner)


@pytest.fixture
def caller_id(request):
    """Who is asking. Override with
    `@pytest.mark.parametrize("caller_id", [OTHER_USER_ID], indirect=True)`
    to check the query follows the caller rather than a fixed value."""
    return getattr(request, "param", USER_ID)


@pytest.fixture
def client(session, caller_id):
    """A TestClient that is authenticated and owns the run it rates.

    /feedback depends on `require_auth` and `get_session`, which would otherwise
    reach the real OIDC issuer and a real Postgres. Overriding both stands in for
    a valid token and an owned run without pretending to validate either -- the
    cases that exercise the genuine unauthenticated and unowned paths live in
    test_routes.py.
    """
    from aegra_api.core.auth_deps import require_auth
    from aegra_api.core.orm import get_session
    from aegra_api.models import User
    from fastapi.testclient import TestClient

    from svelte_langgraph.routes import app

    app.dependency_overrides[require_auth] = lambda: User(
        identity=caller_id, display_name=DISPLAY_NAME, is_authenticated=True
    )
    app.dependency_overrides[get_session] = lambda: session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
