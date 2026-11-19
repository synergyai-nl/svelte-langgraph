"""Authentication for the Aegra backend.

oidc: OIDC access-token validation and the JWKS cache.
handlers: the `Auth` object with its authenticate and authorization handlers.
"""

from .handlers import auth

__all__ = ["auth"]
