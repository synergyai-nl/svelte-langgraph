import logging
import os

from descope import AuthException
from langgraph_sdk import Auth
from langgraph_sdk.auth.types import MinimalUserDict

from descope import DescopeClient

logger = logging.getLogger(__name__)

descope_client = DescopeClient(project_id=os.getenv("DESCOPE_PROJECT_ID", ""))

# The "Auth" object is a container that LangGraph will use to mark our authentication function
auth = Auth()


# The `authenticate` decorator tells LangGraph to call this function as middleware
# for every request. This will determine whether the request is allowed or not
@auth.authenticate
async def get_current_user(authorization: str | None) -> MinimalUserDict:
    """Check if the user's token is valid."""

    return MinimalUserDict(identity="jantje", is_authenticated=True)

    # assert authorization
    # scheme, token = authorization.split()
    # assert scheme.lower() == "bearer"

    # try:
    #     claims = descope_client.validate_session(session_token=token)
    # except AuthException as e:
    #     logger.exception(e)
    #     raise Auth.exceptions.HTTPException(status_code=401, detail=str(e))

    # # Descope Default User JWT
    # # {
    # #   "amr": "[list-of-strings-of-identifiers-used]",
    # #   "drn": "[string-of-type-of-token]",
    # #   "exp": "[timestamp-of-expiration-time]",
    # #   "iat": "[timestamp-of-issued-time]",
    # #   "iss": "Peuc12vtopjqyKM1TedvWYm4Bdfe5yfe",
    # #   "sub": "[string-of-user-id]",
    # #   "dct": "string-tenant-id",
    # #   "roles": "[list-of-strings] //tenant level",
    # #   "permissions": "[list-of-strings] //tenant level",
    # #   "email": "{{user.email}}"
    # # }

    # user = MinimalUserDict(
    #     identity=claims["sub"],
    #     # display_name=
    #     is_authenticated=True,
    #     permissions=claims["permissions"],
    # )

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
