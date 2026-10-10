"""Opt out of the provider matrix the root conftest applies to every test.

That conftest fans tests out across four provider cases and four model names
through an autouse env fixture, which is what the graph tests need. Nothing
here touches a chat model, so pinning both parameters to a single value keeps
this suite at one run per test instead of sixteen.
"""

from typing import Any

import pytest
from aegra_api.core import auth_deps
from aegra_api.core.auth_deps import require_auth
from aegra_api.core.auth_middleware import LangGraphAuthBackend
from aegra_api.core.orm import get_session
from aegra_api.models import User
from fastapi.testclient import TestClient
from sqlalchemy import Select
from sqlalchemy.sql import operators
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, Grouping
from sqlalchemy.sql.operators import custom_op

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


# Deliberately unlike the display name and unlike anything a stray literal in
# the route would plausibly be: an ownership check that hardcoded an identity,
# or read one off the wrong User field, has to miss this.
USER_ID = "oidc|3f2a91c4-owner"
DISPLAY_NAME = "Some Owner"

# A second caller for the tests that vary who is asking. One hardcoded identity
# cannot satisfy an assertion made against both.
OTHER_USER_ID = "oidc|8b7d05e6-other"


def _matches(clause, row: dict[str, Any]) -> bool:
    """Evaluate the route's WHERE clause against one row, rather than
    matching compiled SQL text (which or_ would satisfy just as well)."""
    if isinstance(clause, Grouping):
        return _matches(clause.element, row)
    if isinstance(clause, BooleanClauseList):
        results = [_matches(c, row) for c in clause.clauses]
        if clause.operator is operators.and_:
            return all(results)
        if clause.operator is operators.or_:
            return any(results)
        raise AssertionError(f"unsupported operator: {clause.operator}")
    if isinstance(clause, BinaryExpression):
        if clause.operator is operators.eq:
            return row.get(clause.left.name) == clause.right.value
        # build_metadata_filter's JSONB containment (metadata @> {...}).
        if isinstance(clause.operator, custom_op) and clause.operator.opstring == "@>":
            metadata = row.get(clause.left.name) or {}
            wanted = clause.right.value
            return all(metadata.get(k) == v for k, v in wanted.items())
    raise AssertionError(f"unsupported clause: {clause!r}")


def _leaves(clause) -> list[tuple[str, str, Any]]:
    """Flatten a WHERE clause into `(column, operator, value)` leaves.

    `literal_binds` has no renderer for a JSONB value, so this walks the
    clause instead of compiling it to SQL text.
    """
    if isinstance(clause, Grouping):
        return _leaves(clause.element)
    if isinstance(clause, BooleanClauseList):
        return [leaf for c in clause.clauses for leaf in _leaves(c)]
    if isinstance(clause, BinaryExpression):
        if clause.operator is operators.eq:
            return [(clause.left.name, "eq", clause.right.value)]
        if isinstance(clause.operator, custom_op) and clause.operator.opstring == "@>":
            return [(clause.left.name, "@>", clause.right.value)]
    raise AssertionError(f"unsupported clause: {clause!r}")


class _StubSession:
    """Stands in for the AsyncSession, holding the rows of the thread and
    runs tables. Each query is matched against the table it selects from, so
    a predicate admitting the wrong caller or thread returns the wrong row."""

    def __init__(self, threads: list[dict[str, Any]], runs: list[dict[str, Any]]):
        self._tables = {"thread": threads, "runs": runs}
        self.statements: list[Select] = []

    async def scalar(self, statement):
        self.statements.append(statement)
        column = statement.selected_columns[0]
        for row in self._tables.get(column.table.name, []):
            if _matches(statement.whereclause, row):
                return row.get(column.name)
        return None

    def filters_for(self, table: str = "thread") -> list[tuple[str, str, Any]]:
        for statement in self.statements:
            if statement.selected_columns[0].table.name == table:
                return _leaves(statement.whereclause)
        raise AssertionError(f"no query was made against {table!r}")


@pytest.fixture
def threads(request):
    """The rows of the thread table. Default: one thread the caller owns.
    Parametrize indirect with "foreign" or "none" for the other cases."""
    case = getattr(request, "param", "own")
    if case == "none":
        return []
    owner = OTHER_USER_ID if case == "foreign" else USER_ID
    return [
        {"thread_id": THREAD_ID, "user_id": owner, "metadata_json": {"owner": owner}}
    ]


@pytest.fixture
def runs(request):
    """The rows of the runs table. Default: one run under THREAD_ID.
    Parametrize indirect with "elsewhere" or "none" for the other cases."""
    case = getattr(request, "param", "own")
    if case == "none":
        return []
    thread_id = "other-thread" if case == "elsewhere" else THREAD_ID
    return [{"run_id": RUN_ID, "thread_id": thread_id}]


@pytest.fixture
def session(threads, runs):
    return _StubSession(threads, runs)


@pytest.fixture(autouse=True)
def stub_add_owner(monkeypatch):
    """Stand in for the real `add_owner` handler, same as production without
    depending on Aegra's CWD-resolved, process-cached auth backend."""

    async def fake_handle_event(ctx, _value):
        return {"owner": ctx.user.identity}

    monkeypatch.setattr(views, "handle_event", fake_handle_event)


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
    app = http.app
    app.dependency_overrides[require_auth] = lambda: User(
        identity=caller_id, display_name=DISPLAY_NAME, is_authenticated=authenticated
    )
    app.dependency_overrides[get_session] = lambda: session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
