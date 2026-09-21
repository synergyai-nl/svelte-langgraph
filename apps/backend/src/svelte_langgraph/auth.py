"""Provider access-token verification shared by Aegra and LangGraph Server."""

import logging
import math
import os
import time
from typing import Any

import httpx
from authlib.jose import JsonWebKey, JsonWebToken
from authlib.jose.errors import InvalidClaimError, JoseError
from authlib.oidc.discovery import get_well_known_url
from langgraph_sdk import Auth
from langgraph_sdk.auth.types import MinimalUserDict

_jwt = JsonWebToken(["RS256", "RS384", "RS512"])
logger = logging.getLogger(__name__)
_jwks_cache: dict[str, Any] | None = None


def _configuration() -> tuple[str, str]:
    # Validate at request time: Aegra 0.10.3 falls back to anonymous auth when
    # importing an authentication module fails.
    issuer = os.getenv("AUTH_OIDC_ISSUER", "")
    audience = os.getenv("AUTH_OIDC_AUDIENCE", "")
    if not issuer or not audience:
        raise RuntimeError("AUTH_OIDC_ISSUER and AUTH_OIDC_AUDIENCE are required")
    return issuer, audience


async def _get_jwks(force_refresh: bool = False) -> dict[str, Any]:
    """Cache discovery keys, with an explicit refresh for signing-key rotation."""
    global _jwks_cache
    issuer, _ = _configuration()
    if _jwks_cache is not None and not force_refresh:
        return _jwks_cache

    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.get(get_well_known_url(issuer, external=True))
        response.raise_for_status()
        try:
            config = response.json()
            if config.get("issuer") != issuer:
                raise ValueError("Discovery issuer does not match configuration")
            jwks_uri = config["jwks_uri"]
            if not isinstance(jwks_uri, str) or not jwks_uri:
                raise ValueError("Missing JWKS URI")
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise RuntimeError("Invalid OIDC discovery response") from error

        response = await client.get(jwks_uri)
        response.raise_for_status()
        try:
            jwks = response.json()
            if not isinstance(jwks, dict) or not jwks.get("keys"):
                raise ValueError("Missing signing keys")
            JsonWebKey.import_key_set(jwks)
        except (JoseError, ValueError, KeyError, TypeError) as error:
            raise RuntimeError("Invalid OIDC signing keys") from error
        _jwks_cache = jwks
    return jwks


def _decode_and_validate(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    issuer, audience = _configuration()
    claims = _jwt.decode(
        token,
        JsonWebKey.import_key_set(jwks),
        claims_options={
            "iss": {"essential": True, "value": issuer},
            "sub": {"essential": True},
            "aud": {"essential": True, "value": audience},
            "exp": {"essential": True},
        },
    )
    # Authlib validates values but does not enforce all registered-claim types.
    if not isinstance(claims.get("sub"), str) or not claims["sub"].strip():
        raise InvalidClaimError("sub")
    audiences = claims.get("aud")
    if not isinstance(audiences, str) and not (
        isinstance(audiences, list)
        and audiences
        and all(isinstance(item, str) and item for item in audiences)
    ):
        raise InvalidClaimError("aud")
    for name in ("exp", "nbf", "iat"):
        if name in claims:
            value = claims[name]
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or (isinstance(value, float) and not math.isfinite(value))
            ):
                raise InvalidClaimError(name)
    claims.validate(now=time.time())
    return dict(claims)


async def _validate_token(token: str) -> dict[str, Any]:
    """Retry once on an unknown signing key, never on invalid claims/signature."""
    global _jwks_cache
    jwks = await _get_jwks()
    try:
        return _decode_and_validate(token, jwks)
    except ValueError as error:
        if "key not found" not in str(error).lower():
            raise
        _jwks_cache = None
        jwks = await _get_jwks(force_refresh=True)
        return _decode_and_validate(token, jwks)


auth = Auth()


@auth.authenticate
async def get_current_user(
    headers: dict[str, str] | dict[bytes, bytes] | None,
) -> MinimalUserDict:
    """Authenticate both runtimes' header representations without server imports."""
    authorization = None
    for key, value in (headers or {}).items():
        name = key.decode("latin-1") if isinstance(key, bytes) else key
        if name.lower() == "authorization":
            authorization = (
                value.decode("latin-1") if isinstance(value, bytes) else value
            )
            break
    parts = authorization.split() if authorization else []
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="A Bearer access token is required"
        )

    try:
        claims = await _validate_token(parts[1])
    except (JoseError, ValueError, TypeError):
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="Invalid or expired access token"
        ) from None
    except (httpx.HTTPError, RuntimeError) as error:
        # No claims, credentials, provider response body, or request URL in logs.
        logger.error("Token verification unavailable (%s)", type(error).__name__)
        # Aegra 0.10.3 normalizes callback exceptions to HTTP 401. Preserve the
        # correct classification for runtimes that respect the callback status.
        raise Auth.exceptions.HTTPException(
            status_code=503, detail="Token verification temporarily unavailable"
        ) from None

    return MinimalUserDict(
        identity=claims["sub"],
        is_authenticated=True,
        permissions=claims.get("permissions", []),
    )


@auth.on
async def add_owner(ctx: Auth.types.AuthContext, value: dict) -> dict:
    """Stamp the authenticated owner and restrict every operation to that owner."""
    filters = {"owner": ctx.user.identity}
    metadata = value.get("metadata")
    if metadata is None:
        metadata = value["metadata"] = {}
    metadata.update(filters)
    return filters
