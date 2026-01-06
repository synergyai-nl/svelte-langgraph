import logging
import os
from typing import Any

import httpx
from authlib.jose import JsonWebKey, JsonWebToken
from authlib.jose.errors import (
    BadSignatureError,
    DecodeError,
    JoseError,
    UnsupportedAlgorithmError,
)
from authlib.oidc.discovery import get_well_known_url
from langgraph_sdk import Auth
from langgraph_sdk.auth.types import MinimalUserDict

# Create a JWT decoder with restricted algorithms to prevent alg:none attacks
# See: https://docs.authlib.org/en/latest/jose/jwt.html#jwt-with-limited-algorithms
_jwt = JsonWebToken(["RS256", "RS384", "RS512"])


logger = logging.getLogger(__name__)

oidc_issuer = os.getenv("AUTH_OIDC_ISSUER", "")

_jwks_cache: dict[str, Any] | None = None


async def _get_jwks(force_refresh: bool = False) -> dict[str, Any]:
    """Fetch and cache JWKS from the OIDC issuer.

    Args:
        force_refresh: If True, bypass cache and fetch fresh JWKS.
    """
    global _jwks_cache
    if _jwks_cache is not None and not force_refresh:
        return _jwks_cache

    if not oidc_issuer:
        raise ValueError("AUTH_OIDC_ISSUER environment variable is not set")

    well_known_url = get_well_known_url(oidc_issuer, external=True)
    async with httpx.AsyncClient() as client:
        response = await client.get(well_known_url)
        response.raise_for_status()
        config = response.json()

        jwks_uri = config.get("jwks_uri")
        if not jwks_uri:
            raise ValueError("JWKS URI not found in OIDC configuration")

        jwks_response = await client.get(jwks_uri)
        jwks_response.raise_for_status()
        jwks_data: dict[str, Any] = jwks_response.json()
        _jwks_cache = jwks_data

    return _jwks_cache


def _decode_and_validate(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    """Decode and validate a JWT token against a JWKS.

    Args:
        token: The JWT token string.
        jwks: The JSON Web Key Set to validate against.

    Returns:
        The validated claims dictionary.

    Raises:
        ValueError: If the key is not found in the JWKS.
        JoseError: If token validation fails.
    """
    key_set = JsonWebKey.import_key_set(jwks)
    claims = _jwt.decode(token, key_set)
    claims.validate()
    return dict(claims)


def _is_key_not_found_error(error: Exception) -> bool:
    """Check if an exception is a 'key not found' error from Authlib."""
    return isinstance(error, ValueError) and "key not found" in str(error).lower()


async def _validate_token(token: str) -> dict[str, Any]:
    """Validate a JWT token against the OIDC issuer's JWKS.

    Uses cached JWKS by default. If validation fails due to a missing key
    (e.g., after key rotation), automatically refreshes the JWKS and retries once.
    """
    global _jwks_cache

    try:
        jwks = await _get_jwks()
        claims = _decode_and_validate(token, jwks)
    except ValueError as e:
        if not _is_key_not_found_error(e):
            raise
        _jwks_cache = None
        jwks = await _get_jwks(force_refresh=True)
        claims = _decode_and_validate(token, jwks)

    expected_issuer = oidc_issuer.rstrip("/")
    actual_issuer = str(claims.get("iss", "")).rstrip("/")
    if actual_issuer != expected_issuer:
        raise JoseError(
            f"Invalid issuer: expected {expected_issuer}, got {actual_issuer}"
        )

    return claims


auth = Auth()


@auth.authenticate
async def get_current_user(authorization: str | None) -> MinimalUserDict:
    """Check if the user's token is valid."""

    if not authorization:
        logger.error("No authorization header provided.")
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="No token provided."
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="Invalid authorization header format."
        )

    scheme, token = parts
    if scheme.lower() != "bearer":
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="Invalid auth scheme. Expected 'Bearer'."
        )

    try:
        claims = await _validate_token(token)
    except (DecodeError, BadSignatureError, UnsupportedAlgorithmError) as e:
        # Invalid token format, tampered signature, or unsupported algorithm
        logger.error(f"Token validation failed: {type(e).__name__}: {e}")
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="Invalid or malformed token"
        )
    except JoseError as e:
        # Other JWT validation errors
        logger.exception(e)
        raise Auth.exceptions.HTTPException(status_code=401, detail=str(e))
    except httpx.HTTPError as e:
        logger.exception(e)
        raise Auth.exceptions.HTTPException(
            status_code=401, detail=f"Failed to validate token: {e}"
        )

    user = MinimalUserDict(
        identity=claims["sub"],
        is_authenticated=True,
        permissions=claims.get("permissions", []),
    )

    return user


@auth.on
async def add_owner(
    ctx: Auth.types.AuthContext,
    value: dict,  # The payload being sent to this access method
) -> dict:  # Returns a filter dict that restricts access to resources
    """Authorize all access to threads, runs, crons, and assistants.

    This handler does two things:
        - Adds a value to resource metadata (to persist with the resource so it can be filtered later)
        - Returns a filter (to restrict access to existing resources)

    Args:
        ctx: Authentication context containing user info, permissions, the path, and
        value: The request payload sent to the endpoint. For creation
              operations, this contains the resource parameters. For read
              operations, this contains the resource being accessed.

    Returns:
        A filter dictionary that LangGraph uses to restrict access to resources.
    """
    # Create filter to restrict access to just this user's resources
    filters = {"owner": ctx.user.identity}

    # Get or create the metadata dictionary in the payload
    # This is where we store persistent info about the resource
    metadata = value.setdefault("metadata", {})

    # Add owner to metadata - if this is a create or update operation,
    # this information will be saved with the resource
    # So we can filter by it later in read operations
    metadata.update(filters)

    # Return filters to restrict access
    # These filters are applied to ALL operations (create, read, update, search, etc.)
    # to ensure users can only access their own resources
    return filters
