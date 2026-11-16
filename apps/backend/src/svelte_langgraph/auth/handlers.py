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
from .run_input import RUN_INPUT_EVENTS, validate_run_input

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
    except ValueError as e:
        # The signing key is not in the (freshly fetched) JWKS, for example
        # because the identity provider removed it.
        if not oidc._is_key_not_found_error(e):
            raise
        logger.error(f"Token validation failed: {e}")
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
    # The graph reads the user's name from here (`langgraph_auth_user`), never
    # from client run input. Without a name Aegra uses the identity instead.
    name = claims.get("name")
    if isinstance(name, str) and name.strip():
        user["display_name"] = name

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
        For `threads.create_run` it also carries a `context` that Aegra merges
        into the run.

    Raises:
        Auth.exceptions.HTTPException: 422 when an event in RUN_INPUT_EVENTS
            carries run input that `validate_run_input` rejects.
    """
    event = (ctx.resource, ctx.action)
    if event in RUN_INPUT_EVENTS:
        validate_run_input(value)

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

    if event == ("threads", "create_run"):
        # On the run-create routes Aegra merges a returned `context` into the
        # run (the client's is empty, see above), so the graph gets one
        # server-derived key it can trust. A non-empty context also stops
        # Aegra from copying the client's `configurable` into the context.
        # Routes that discard the return still validated the input above.
        return {**filters, "context": {"user_id": ctx.user.identity}}

    # Return filters to restrict access
    # These filters are applied to ALL operations (create, read, update, search, etc.)
    # to ensure users can only access their own resources
    return filters
