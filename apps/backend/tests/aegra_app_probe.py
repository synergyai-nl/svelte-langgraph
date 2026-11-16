"""Build Aegra's real app, the way `aegra_api.main:app` does at startup.

Run as a script by tests/test_deny_routes.py, in its own process: importing
`aegra_api.main` changes `svelte_langgraph.http.app` in place (core routers,
middleware, lifespan), and other tests use that object.

Usage: python aegra_app_probe.py <probes.json> <result.json>

Writes the route table, the middleware order and the response to each probe
request. The lifespan (database, workers) is not started, so only requests
answered before a route touches the database are meaningful.
"""

import json
import sys
from typing import Any

from fastapi.testclient import TestClient
from starlette.routing import Mount, Route


def _routes(routes: list[Any], prefix: str = "") -> list[list[str]]:
    """[method, path] per route and method; other route kinds by type name."""
    table: list[list[str]] = []
    for route in routes:
        if isinstance(route, Route):  # APIRoute too
            table += [
                [method, prefix + route.path] for method in sorted(route.methods or ())
            ]
        elif isinstance(route, Mount):
            table += _routes(list(route.routes), prefix + route.path)
        elif getattr(route, "original_router", None) is not None:
            # Newer FastAPI wraps included routers instead of copying routes.
            table += _routes(list(route.original_router.routes), prefix)
        else:
            # A websocket route, or a kind the test must learn about.
            table.append([type(route).__name__, prefix + getattr(route, "path", "?")])
    return table


def main(probes_path: str, result_path: str) -> None:
    from aegra_api.main import app

    with open(probes_path) as file:
        probes: dict[str, dict[str, Any]] = json.load(file)

    client = TestClient(app)  # no `with`: the lifespan is not started
    responses = {}
    for name, probe in probes.items():
        response = client.request(
            probe["method"],
            probe["url"],
            headers=probe.get("headers", {}),
            json=probe.get("json"),
            follow_redirects=False,
        )
        responses[name] = {
            "status": response.status_code,
            "headers": dict(response.headers),
            "body": response.text,
        }

    result = {
        "routes": _routes(list(app.routes)),
        "middleware": [
            getattr(middleware.cls, "__name__", repr(middleware.cls))
            for middleware in app.user_middleware
        ],
        "responses": responses,
    }
    with open(result_path, "w") as file:
        json.dump(result, file)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
