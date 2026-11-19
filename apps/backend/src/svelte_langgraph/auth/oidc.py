import logging
import os
from typing import Any

import httpx
from authlib.jose import JsonWebKey, JsonWebToken
from authlib.jose.errors import JoseError
from authlib.oidc.discovery import get_well_known_url

# Create a JWT decoder with restricted algorithms to prevent alg:none attacks
# See: https://docs.authlib.org/en/latest/jose/jwt.html#jwt-with-limited-algorithms
_jwt = JsonWebToken(["RS256", "RS384", "RS512"])


logger = logging.getLogger(__name__)

oidc_issuer = os.getenv("AUTH_OIDC_ISSUER", "")
# The API audience the IdP puts in access tokens issued for this backend.
oidc_audience = os.getenv("AUTH_OIDC_AUDIENCE", "")

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
    """Decode and validate a JWT access token against a JWKS.

    Besides the signature, `sub`, `exp` and `aud` (which must contain
    AUTH_OIDC_AUDIENCE) are required; the issuer is checked by the caller.

    Args:
        token: The JWT token string.
        jwks: The JSON Web Key Set to validate against.

    Returns:
        The validated claims dictionary.

    Raises:
        ValueError: If the key is not found in the JWKS.
        JoseError: If token validation fails.
    """
    if not oidc_audience:
        raise ValueError("AUTH_OIDC_AUDIENCE environment variable is not set")

    key_set = JsonWebKey.import_key_set(jwks)
    claims = _jwt.decode(
        token,
        key_set,
        claims_options={
            "sub": {"essential": True},
            "exp": {"essential": True},
            "aud": {"essential": True, "value": oidc_audience},
        },
    )
    claims.validate()
    return dict(claims)


def _is_key_not_found_error(error: Exception) -> bool:
    """Check if an exception is a 'key not found' error from Authlib."""
    return isinstance(error, ValueError) and "key not found" in str(error).lower()


async def _validate_token(token: str) -> dict[str, Any]:
    """Validate a JWT access token against the OIDC issuer's JWKS.

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
