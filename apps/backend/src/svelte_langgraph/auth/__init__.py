"""Authentication for the Aegra backend.

oidc: OIDC access-token validation and the JWKS cache.
handlers: the `Auth` object with its authenticate and authorization handlers.
startup: the startup check that Aegra loaded that object.
"""

from .handlers import auth

__all__ = ["auth"]
