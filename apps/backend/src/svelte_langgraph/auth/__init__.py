"""Authentication for the Aegra backend.

oidc: OIDC access-token validation and the JWKS cache.
handlers: the `Auth` object with its authenticate and authorization handlers.
run_input: the checks on client run input that the authorization handler runs.
startup: the startup check that Aegra loaded that object.
deny: the middleware that answers 403 on routes the handlers cannot police.
"""

from .handlers import auth

__all__ = ["auth"]
