import asyncio
import logging
import math
import os
import time
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


def _read_jwks_ttl(raw: str | None) -> float:
    """Parse AUTH_JWKS_TTL_SECONDS: a non-negative number of seconds, default 300.

    0 means "fetch the JWKS on every request". Anything else invalid fails at
    import, so a typo cannot silently leave the cache without a lifetime.
    """
    if raw is None or raw.strip() == "":
        return 300.0
    try:
        ttl = float(raw)
    except ValueError:
        ttl = math.nan
    if not math.isfinite(ttl) or ttl < 0:
        raise ValueError(
            f"AUTH_JWKS_TTL_SECONDS must be a non-negative number of seconds, got {raw!r}"
        )
    return ttl


# How long fetched signing keys are trusted. After that the JWKS is fetched
# again, so a key the IdP removed stops validating tokens.
jwks_ttl_seconds = _read_jwks_ttl(os.getenv("AUTH_JWKS_TTL_SECONDS"))

_jwks_cache: dict[str, Any] | None = None
# time.monotonic() when _jwks_cache was fetched.
_jwks_fetched_at: float = 0.0
# Held while the JWKS is fetched, so concurrent requests share one fetch.
_jwks_lock = asyncio.Lock()


def _jwks_cache_is_fresh() -> bool:
    return (
        _jwks_cache is not None
        and time.monotonic() - _jwks_fetched_at < jwks_ttl_seconds
    )


async def _get_jwks(force_refresh: bool = False) -> dict[str, Any]:
    """Fetch and cache JWKS from the OIDC issuer.

    The cache expires after AUTH_JWKS_TTL_SECONDS. A failed fetch raises; the
    expired keys are never used as a fallback (fail closed). Concurrent
    requests share one fetch.

    Args:
        force_refresh: If True, bypass cache and fetch fresh JWKS. A forced
            refresh that waited while another request fetched uses that result.
    """
    if _jwks_cache is not None and not force_refresh and _jwks_cache_is_fresh():
        return _jwks_cache

    seen = _jwks_fetched_at
    async with _jwks_lock:
        # Another request may have fetched while this one waited.
        if _jwks_cache is not None:
            if not force_refresh and _jwks_cache_is_fresh():
                return _jwks_cache
            if force_refresh and _jwks_fetched_at != seen:
                return _jwks_cache
        return await _fetch_jwks()


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch the JWKS and store it in the cache. Call with _jwks_lock held."""
    global _jwks_cache, _jwks_fetched_at
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
        _jwks_fetched_at = time.monotonic()

    return jwks_data


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
    try:
        jwks = await _get_jwks()
        claims = _decode_and_validate(token, jwks)
    except ValueError as e:
        if not _is_key_not_found_error(e):
            raise
        jwks = await _get_jwks(force_refresh=True)
        claims = _decode_and_validate(token, jwks)

    expected_issuer = oidc_issuer.rstrip("/")
    actual_issuer = str(claims.get("iss", "")).rstrip("/")
    if actual_issuer != expected_issuer:
        raise JoseError(
            f"Invalid issuer: expected {expected_issuer}, got {actual_issuer}"
        )

    return claims
