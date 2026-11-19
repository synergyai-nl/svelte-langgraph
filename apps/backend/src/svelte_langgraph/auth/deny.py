"""Refuse the Aegra routes that the auth handler cannot police.

Aegra mounts every Agent Protocol route and has no switch to turn one off.
Some of them run the graph, or write its checkpoints, without the
`threads.create_run` event that `auth.add_owner` uses to validate run input
and set the server-side run context:

- Crons. The first run and every scheduled run are prepared directly, so they
  never pass the run-create event and get no server-set context.
  `CRON_ENABLED=false` only stops the scheduler; the routes stay mounted.
- `POST /threads/{thread_id}/state`. It writes the checkpoint without running
  the graph, so the graph's own checks (`graph.phase_gate`) never run. Its
  auth event is `threads.update`, the same as renaming a thread.

`DenyRoutesMiddleware` answers these with 403 for every caller, before
authentication, in Aegra's error body shape. Copy this module and its
registration in `http.py` into your own `http.app`.
"""

from aegra_api.models.errors import AgentProtocolError, get_error_type
from starlette._utils import get_route_path
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

# Methods that only read. A read of a thread's state stays allowed.
_READ_METHODS = frozenset({"GET", "HEAD"})


def is_denied(method: str, path: str) -> bool:
    """Whether `method path` is refused for every caller.

    `path` is the path the router matches: without `root_path` and with
    percent-encoding decoded. It is compared by segment: empty segments
    (duplicate or trailing slashes) are dropped and letters are compared
    case-insensitively, so a variant the router would redirect to a denied
    route, or reject, is denied as well.
    """
    method = method.upper()
    if method == "OPTIONS":
        # CORS preflight; no route here answers OPTIONS itself.
        return False
    segments = [segment.casefold() for segment in path.split("/") if segment]

    # DOWNSTREAM APPS: to keep a route your app really needs, return False for
    # it here, above the rules below. Your app must then guarantee itself what
    # the rule protected; see "Crons and direct thread-state writes return 403"
    # in docs/upgrading.md.

    match segments:
        case ["runs", "crons", *_] | ["threads", _, "runs", "crons", *_]:
            # Cron runs skip the run-create event and its server-set context.
            return True
        case ["threads", _, "state"]:
            # A direct checkpoint write skips the graph's own checks.
            return method not in _READ_METHODS
    return False


class DenyRoutesMiddleware:
    """Answer 403 for every request that `is_denied` refuses.

    Register it with `app.add_middleware` on the `http.app`: Aegra then adds
    its own middleware (CORS among it) outside this one, so the 403 still
    carries CORS headers. Other scope types (lifespan) pass through; Aegra
    serves no websocket routes.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and is_denied(
            scope["method"], get_route_path(scope)
        ):
            body = AgentProtocolError(
                error=get_error_type(403),
                message="This route is disabled on this server.",
                details=None,
            )
            response = JSONResponse(status_code=403, content=body.model_dump())
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
