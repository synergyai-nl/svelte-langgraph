"""Opt out of the provider matrix the root conftest applies to every test.

That conftest fans tests out across four provider cases and four model names
through an autouse env fixture, which is what the graph tests need. Nothing
here touches a chat model, so pinning both parameters to a single value keeps
this suite at one run per test instead of sixteen.
"""

import pytest
from aegra_api.core import auth_deps
from aegra_api.core.auth_deps import require_auth
from aegra_api.core.auth_middleware import LangGraphAuthBackend
from aegra_api.core.orm import get_session
from aegra_api.models import User
from fastapi.testclient import TestClient
from sqlalchemy import Select
from sqlalchemy.sql import operators
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList

from svelte_langgraph import routes

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


def _matches(clause, row: dict[str, str]) -> bool:
    """Evaluate the route's WHERE clause against one row.

    Semantic rather than textual on purpose. Asserting the compiled SQL only
    proves both column names appear in it, which and_ and or_ do equally --
    and or_ hands every run to every caller.
    """
    if isinstance(clause, BooleanClauseList):
        results = [_matches(c, row) for c in clause.clauses]
        if clause.operator is operators.and_:
            return all(results)
        if clause.operator is operators.or_:
            return any(results)
        raise AssertionError(f"unsupported operator: {clause.operator}")
    if isinstance(clause, BinaryExpression) and clause.operator is operators.eq:
        return row.get(clause.left.name) == clause.right.value
    raise AssertionError(f"unsupported clause: {clause!r}")


class _StubSession:
    """Stands in for the AsyncSession, holding the rows of the runs table.

    Answers the route's query by actually applying its WHERE clause, so a
    predicate that admits the wrong caller returns the wrong row here too.
    """

    def __init__(self, rows: list[dict[str, str]]):
        self._rows = rows
        self.statement: Select | None = None

    async def scalar(self, statement):
        self.statement = statement
        for row in self._rows:
            if _matches(statement.whereclause, row):
                return row["run_id"]
        return None

    def compiled_sql(self) -> str:
        assert self.statement is not None, "nothing was queried"
        return str(self.statement.compile(compile_kwargs={"literal_binds": True}))


@pytest.fixture
def runs(request):
    """The rows of the runs table. By default the one run the caller owns.

    Override with `@pytest.mark.parametrize("runs", ["foreign"], indirect=True)`
    for a run that exists but belongs to someone else, or `["none"]` for a run
    that is not there at all. The route must answer 404 to both.
    """
    case = getattr(request, "param", "own")
    if case == "none":
        return []
    owner = OTHER_USER_ID if case == "foreign" else USER_ID
    return [{"run_id": RUN_ID, "user_id": owner}]


@pytest.fixture
def session(runs):
    return _StubSession(runs)


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
def client(session, caller_id, authenticated):
    """A TestClient that is authenticated and owns the run it rates.

    /feedback depends on `require_auth` and `get_session`, which would otherwise
    reach the real OIDC issuer and a real Postgres. Overriding both stands in for
    a valid token and an owned run without pretending to validate either -- the
    cases that exercise the genuine unauthenticated and unowned paths live in
    test_routes.py.
    """
    app = routes.app
    app.dependency_overrides[require_auth] = lambda: User(
        identity=caller_id, display_name=DISPLAY_NAME, is_authenticated=authenticated
    )
    app.dependency_overrides[get_session] = lambda: session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
