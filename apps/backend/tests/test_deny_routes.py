"""The backend refuses, by path, the Aegra routes its auth handler cannot police."""

import json
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI, Request, WebSocket
from fastapi.testclient import TestClient

from svelte_langgraph import http
from svelte_langgraph.deny import DenyRoutesMiddleware, is_denied
from tests.conftest import PROVIDER_CASES

BACKEND_DIR = Path(__file__).resolve().parents[1]

FORBIDDEN_BODY = {
    "error": "forbidden",
    "message": "This route is disabled on this server.",
    "details": None,
}


# Nothing here touches a chat model: opt out of the root conftest's provider matrix.
@pytest.fixture(scope="module")
def provider_case():
    return PROVIDER_CASES[0]


@pytest.fixture
def chat_model():
    return None


DENY, ALLOW = True, False

# Every route of the real app (aegra-api 0.11.0 plus http.py), with the
# expected answer of `is_denied`. An Aegra upgrade that adds a route fails
# `test_route_table_has_no_unknown_routes` until the route is listed here.
KNOWN_ROUTES: dict[tuple[str, str], bool] = {
    # Our own routes (http.py) and FastAPI's docs pages.
    ("POST", "/titles"): ALLOW,
    ("POST", "/feedback"): ALLOW,
    ("GET", "/openapi.json"): ALLOW,
    ("HEAD", "/openapi.json"): ALLOW,
    ("GET", "/docs"): ALLOW,
    ("HEAD", "/docs"): ALLOW,
    ("GET", "/docs/oauth2-redirect"): ALLOW,
    ("HEAD", "/docs/oauth2-redirect"): ALLOW,
    ("GET", "/redoc"): ALLOW,
    ("HEAD", "/redoc"): ALLOW,
    # Health and the root: public, read only.
    ("GET", "/"): ALLOW,
    ("GET", "/info"): ALLOW,
    ("GET", "/health"): ALLOW,
    ("GET", "/ready"): ALLOW,
    ("GET", "/live"): ALLOW,
    # Assistants: the auth handler validates config/context on create/update.
    ("POST", "/assistants"): ALLOW,
    ("GET", "/assistants"): ALLOW,
    ("POST", "/assistants/search"): ALLOW,
    ("POST", "/assistants/count"): ALLOW,
    ("GET", "/assistants/{assistant_id}"): ALLOW,
    ("PATCH", "/assistants/{assistant_id}"): ALLOW,
    ("DELETE", "/assistants/{assistant_id}"): ALLOW,
    ("POST", "/assistants/{assistant_id}/latest"): ALLOW,
    ("POST", "/assistants/{assistant_id}/versions"): ALLOW,
    ("GET", "/assistants/{assistant_id}/schemas"): ALLOW,
    ("GET", "/assistants/{assistant_id}/graph"): ALLOW,
    ("GET", "/assistants/{assistant_id}/subgraphs"): ALLOW,
    # Threads: metadata and reads. PATCH only changes metadata (the title).
    ("POST", "/threads"): ALLOW,
    ("GET", "/threads"): ALLOW,
    ("GET", "/threads/{thread_id}"): ALLOW,
    ("PATCH", "/threads/{thread_id}"): ALLOW,
    ("DELETE", "/threads/{thread_id}"): ALLOW,
    ("POST", "/threads/prune"): ALLOW,
    ("POST", "/threads/search"): ALLOW,
    # Thread state: reads pass; the direct write skips the graph's checks.
    ("GET", "/threads/{thread_id}/state"): ALLOW,
    ("POST", "/threads/{thread_id}/state"): DENY,
    ("GET", "/threads/{thread_id}/state/{checkpoint_id}"): ALLOW,
    ("POST", "/threads/{thread_id}/state/checkpoint"): ALLOW,
    ("POST", "/threads/{thread_id}/history"): ALLOW,
    ("GET", "/threads/{thread_id}/history"): ALLOW,
    # Runs: every create goes through the `threads.create_run` event.
    ("POST", "/threads/{thread_id}/runs"): ALLOW,
    ("POST", "/threads/{thread_id}/runs/stream"): ALLOW,
    ("POST", "/threads/{thread_id}/runs/wait"): ALLOW,
    ("GET", "/threads/{thread_id}/runs"): ALLOW,
    ("GET", "/threads/{thread_id}/runs/{run_id}"): ALLOW,
    ("PATCH", "/threads/{thread_id}/runs/{run_id}"): ALLOW,
    ("DELETE", "/threads/{thread_id}/runs/{run_id}"): ALLOW,
    ("GET", "/threads/{thread_id}/runs/{run_id}/join"): ALLOW,
    ("GET", "/threads/{thread_id}/runs/{run_id}/stream"): ALLOW,
    ("POST", "/threads/{thread_id}/runs/{run_id}/cancel"): ALLOW,
    ("POST", "/runs/cancel"): ALLOW,
    # Stateless runs delegate to the thread run routes, event included.
    ("POST", "/runs"): ALLOW,
    ("POST", "/runs/stream"): ALLOW,
    ("POST", "/runs/wait"): ALLOW,
    # Crons: their runs skip the run-create event and its server-set context.
    ("POST", "/runs/crons"): DENY,
    ("POST", "/threads/{thread_id}/runs/crons"): DENY,
    ("PATCH", "/runs/crons/{cron_id}"): DENY,
    ("DELETE", "/runs/crons/{cron_id}"): DENY,
    ("POST", "/runs/crons/search"): DENY,
    ("POST", "/runs/crons/count"): DENY,
    # Store: user-scoped key-value storage; the graph does not use it.
    ("PUT", "/store/items"): ALLOW,
    ("GET", "/store/items"): ALLOW,
    ("DELETE", "/store/items"): ALLOW,
    ("POST", "/store/items/search"): ALLOW,
    ("POST", "/store/namespaces"): ALLOW,
    # Event streaming v2: the event stream only reads; commands start runs
    # that cannot get the server-set context.
    ("POST", "/threads/{thread_id}/stream/events"): ALLOW,
    ("POST", "/threads/{thread_id}/commands"): DENY,
}


# --- The policy --------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/runs/crons"),
        ("POST", "/threads/t1/runs/crons"),
        ("PATCH", "/runs/crons/c1"),
        ("DELETE", "/runs/crons/c1"),
        ("POST", "/runs/crons/search"),
        ("POST", "/runs/crons/count"),
        ("POST", "/threads/t1/state"),
        ("POST", "/threads/t1/commands"),
        # Every method on the cron and command paths, and every write on state.
        ("GET", "/runs/crons"),
        ("HEAD", "/runs/crons/search"),
        ("PUT", "/runs/crons/c1"),
        ("GET", "/threads/t1/commands"),
        ("PATCH", "/threads/t1/state"),
        ("PUT", "/threads/t1/state"),
        ("DELETE", "/threads/t1/state"),
        # Spellings the router redirects or rejects.
        ("POST", "/runs/crons/"),
        ("POST", "//runs//crons"),
        ("POST", "/threads/t1/state/"),
        ("POST", "/threads//t1/commands"),
        ("POST", "/RUNS/Crons"),
        ("POST", "/threads/t1/STATE"),
        ("post", "/threads/t1/state"),
    ],
)
def test_policy_denies(method, path):
    assert is_denied(method, path)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/threads/t1/state"),
        ("HEAD", "/threads/t1/state"),
        ("GET", "/threads/t1/state/cp1"),
        ("POST", "/threads/t1/state/checkpoint"),
        ("PATCH", "/threads/t1"),
        ("POST", "/threads/t1/history"),
        ("POST", "/threads/t1/runs"),
        ("POST", "/threads/t1/runs/stream"),
        ("POST", "/threads/t1/runs/wait"),
        ("POST", "/runs/stream"),
        ("POST", "/runs/cancel"),
        ("POST", "/threads/t1/stream/events"),
        ("POST", "/titles"),
        ("POST", "/feedback"),
        ("GET", "/"),
        ("GET", ""),
        # A thread id that happens to spell a denied word.
        ("PATCH", "/threads/crons"),
        ("GET", "/threads/state"),
        ("POST", "/threads/commands/runs"),
        # CORS preflight on any path.
        ("OPTIONS", "/runs/crons"),
        ("OPTIONS", "/threads/t1/state"),
        ("OPTIONS", "/threads/t1/commands"),
    ],
)
def test_policy_allows(method, path):
    assert not is_denied(method, path)


@pytest.mark.parametrize(("route", "denied"), KNOWN_ROUTES.items())
def test_known_route_classification(route, denied):
    assert is_denied(*route) is denied


# --- The middleware on a small app --------------------------------------------

ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@pytest.fixture
def small_app():
    events: list[str] = []

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        events.append("startup")
        yield

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(DenyRoutesMiddleware)

    @app.api_route("/{rest:path}", methods=ALL_METHODS)
    async def reached(rest: str, request: Request) -> dict[str, str]:
        return {"reached": f"/{rest}", "root_path": request.scope.get("root_path", "")}

    @app.websocket("/runs/crons")
    async def socket(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_text("open")
        await websocket.close()

    app.state.events = events
    return app


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("POST", "/runs/crons"),
        ("POST", "/threads/t1/runs/crons"),
        ("DELETE", "/runs/crons/c1"),
        ("POST", "/threads/t1/state"),
        ("POST", "/threads/t1/commands"),
        # Percent-encoding is decoded before routing, and before the policy.
        ("POST", "/runs%2Fcrons"),
        ("POST", "/threads/t1/stat%65"),
        ("POST", "/threads/t1%2Fcommands"),
    ],
)
def test_middleware_answers_403_in_aegras_error_shape(small_app, method, url):
    response = TestClient(small_app).request(method, url)
    assert response.status_code == 403
    assert response.json() == FORBIDDEN_BODY


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", "/threads/t1/state"),
        ("PATCH", "/threads/t1"),
        ("POST", "/threads/t1/history"),
        ("POST", "/threads/t1/runs/stream"),
        ("OPTIONS", "/runs/crons"),
    ],
)
def test_middleware_passes_other_requests_through(small_app, method, url):
    response = TestClient(small_app).request(method, url)
    assert response.status_code == 200
    assert response.json()["reached"] == url


@pytest.mark.parametrize(
    "url",
    ["/api/runs/crons", "/runs/crons", "/api/threads/t1/state"],
)
def test_middleware_matches_the_path_without_root_path(small_app, url):
    """Starlette's router matches the path without `root_path` when it starts
    with it, and the full path otherwise; the policy sees the same path."""
    client = TestClient(small_app, root_path="/api")
    assert client.post(url).status_code == 403
    assert client.get("/api/threads/t1/state").status_code == 200


def test_middleware_passes_lifespan_and_websocket_through(small_app):
    with TestClient(small_app) as client:
        assert small_app.state.events == ["startup"]
        with client.websocket_connect("/runs/crons") as websocket:
            assert websocket.receive_text() == "open"


def test_http_app_registers_the_middleware():
    assert DenyRoutesMiddleware in [m.cls for m in http.app.user_middleware]


# --- The real app --------------------------------------------------------------

ORIGIN = "https://app.example"
PROBES = {
    "cron_create": {
        "method": "POST",
        "url": "/runs/crons",
        "headers": {"Origin": ORIGIN},
    },
    "state_write": {
        "method": "POST",
        "url": "/threads/t1/state",
        "json": {"values": {}},
    },
    "command": {"method": "POST", "url": "/threads/t1/commands"},
    "trailing_slash": {"method": "POST", "url": "/runs/crons/"},
    "encoded_slash": {"method": "POST", "url": "/threads/t1%2Fcommands"},
    "state_read": {"method": "GET", "url": "/threads/t1/state"},
    "preflight": {
        "method": "OPTIONS",
        "url": "/threads/t1/state",
        "headers": {"Origin": ORIGIN, "Access-Control-Request-Method": "POST"},
    },
}


@pytest.fixture(scope="module")
def real_app(tmp_path_factory):
    """Route table, middleware order and probe responses of Aegra's real app.

    Built in a child process: see tests/aegra_app_probe.py for why.
    """
    workdir = tmp_path_factory.mktemp("aegra_app")
    probes_path, result_path = workdir / "probes.json", workdir / "result.json"
    probes_path.write_text(json.dumps(PROBES))
    env = {
        **os.environ,
        "AEGRA_CONFIG": str(BACKEND_DIR / "aegra.json"),
        # Keep the route table independent of the local environment.
        "ENABLE_PROMETHEUS_METRICS": "false",
    }
    subprocess.run(
        [sys.executable, str(Path(__file__).with_name("aegra_app_probe.py"))]
        + [str(probes_path), str(result_path)],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        timeout=120,
    )
    return json.loads(result_path.read_text())


def test_route_table_has_no_unknown_routes(real_app):
    """A new Aegra route must be classified in KNOWN_ROUTES first."""
    mounted = {tuple(route) for route in real_app["routes"]}
    assert mounted - KNOWN_ROUTES.keys() == set()


def test_every_known_route_is_still_mounted(real_app):
    mounted = {tuple(route) for route in real_app["routes"]}
    assert KNOWN_ROUTES.keys() - mounted == set()


def test_deny_middleware_runs_inside_aegras_cors(real_app):
    middleware = real_app["middleware"]
    assert middleware[-1] == "DenyRoutesMiddleware"
    assert "CORSMiddleware" in middleware[:-1]


@pytest.mark.parametrize(
    "probe",
    ["cron_create", "state_write", "command", "trailing_slash", "encoded_slash"],
)
def test_real_app_answers_403_before_authentication(real_app, probe):
    response = real_app["responses"][probe]
    assert response["status"] == 403
    assert json.loads(response["body"]) == FORBIDDEN_BODY


def test_real_app_403_carries_cors_headers(real_app):
    headers = real_app["responses"]["cron_create"]["headers"]
    assert headers["access-control-allow-origin"] == "*"


def test_real_app_passes_state_reads_and_preflight(real_app):
    # No token: the request got past the middleware to Aegra's authentication.
    assert real_app["responses"]["state_read"]["status"] == 401
    preflight = real_app["responses"]["preflight"]
    assert preflight["status"] == 200
    assert preflight["headers"]["access-control-allow-origin"] == "*"
