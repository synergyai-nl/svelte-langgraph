import logging
import os

from authlib.jose import JsonWebToken, JWTClaims, KeySet
from authlib.jose.rfc7517 import JsonWebKey
from authlib.jose.errors import JoseError

from langgraph_sdk import Auth
from langgraph_sdk.auth.types import MinimalUserDict


logger = logging.getLogger(__name__)

oidc_issuer = os.getenv("AUTH_OIDC_ISSUER", "")
oidc_audience = os.getenv("AUTH_OIDC_AUDIENCE", "")

jwt = JsonWebToken(["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"])

auth = Auth()


def get_jwks_uri(issuer: str) -> str:
    """Get JWKS URI from OIDC discovery endpoint."""
    import requests

    discovery_url = f"{issuer}/.well-known/openid-configuration"
    response = requests.get(discovery_url)
    response.raise_for_status()
    config = response.json()
    return config["jwks_uri"]


def get_jwks(jwks_uri: str) -> KeySet:
    """Fetch JWKS from the provider."""
    import requests

    response = requests.get(jwks_uri)
    response.raise_for_status()
    jwks_dict = response.json()
    keys = [JsonWebKey.import_key(key) for key in jwks_dict["keys"]]
    return KeySet(keys)


jwks_uri = get_jwks_uri(oidc_issuer) if oidc_issuer else ""
jwks_data = get_jwks(jwks_uri) if jwks_uri else KeySet([])


@auth.authenticate
async def get_current_user(authorization: str | None) -> MinimalUserDict:
    """Check if the user's token is valid using OIDC."""

    if not authorization:
        logger.error("No authorization header provided.")
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="No token provided."
        )

    scheme, token = authorization.split(" ", 1)
    if scheme.lower() != "bearer":
        raise Auth.exceptions.HTTPException(
            status_code=401, detail="Invalid auth scheme. Expected 'Bearer'."
        )

    try:
        claims: JWTClaims = jwt.decode(
            token, jwks_data, claims_options={"iss": {"value": oidc_issuer}}
        )
        claims.validate()
    except JoseError as e:
        logger.exception(e)
        raise Auth.exceptions.HTTPException(status_code=401, detail=str(e))

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
