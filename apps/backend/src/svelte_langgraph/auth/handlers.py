import logging

import httpx
from authlib.jose.errors import (
    BadSignatureError,
    DecodeError,
    JoseError,
    UnsupportedAlgorithmError,
)
from langgraph_sdk import Auth
from langgraph_sdk.auth.types import MinimalUserDict

from . import oidc

logger = logging.getLogger(__name__)

auth = Auth()


@auth.authenticate
async def get_current_user(headers: dict[str, str] | None) -> MinimalUserDict:
    """Check if the user's token is valid.

    Aegra calls this handler with the request headers as a dict with
    lowercase keys (unlike langgraph-api, which injected individual
    parameters by name).
    """

    authorization = (headers or {}).get("authorization")

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
        claims = await oidc._validate_token(token)
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
    # Note: Aegra builds the payload via model_dump(), so "metadata" may be
    # present but None rather than absent.
    metadata = value.get("metadata")
    if metadata is None:
        metadata = value["metadata"] = {}

    # Add owner to metadata - if this is a create or update operation,
    # this information will be saved with the resource
    # So we can filter by it later in read operations
    metadata.update(filters)

    # Return filters to restrict access
    # These filters are applied to ALL operations (create, read, update, search, etc.)
    # to ensure users can only access their own resources
    return filters
