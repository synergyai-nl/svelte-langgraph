"""Unit tests for OIDC authentication module."""

import asyncio
import base64
import json
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from authlib.jose import JsonWebKey, jwt
from langgraph_sdk import Auth

from svelte_langgraph.auth import handlers, oidc


@pytest.fixture(autouse=True)
def reset_jwks_cache() -> None:
    """Reset the JWKS cache before each test."""
    oidc._jwks_cache = None
    oidc._jwks_fetched_at = 0.0
    # A lock used under one test's event loop must not leak into the next.
    oidc._jwks_lock = asyncio.Lock()


def seed_jwks(jwks: dict[str, Any]) -> None:
    """Put a JWKS in the cache as if it had just been fetched."""
    oidc._jwks_cache = jwks
    oidc._jwks_fetched_at = time.monotonic()


API_AUDIENCE = "svelte-langgraph-api"
ISSUER = "http://localhost:8080"


@pytest.fixture(autouse=True)
def configured_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    """The verifier requires AUTH_OIDC_AUDIENCE; configure it for every test."""
    monkeypatch.setattr(oidc, "oidc_audience", API_AUDIENCE)


@pytest.fixture
def mock_jwks() -> dict[str, Any]:
    """Return a mock JWKS response compliant with RFC 7517 (JSON Web Key).

    RFC 7517 specifies the JWK format. For RSA public keys, the required fields are:
    - "kty": Key Type - REQUIRED. Must be "RSA" for RSA keys.
    - "n": Modulus - REQUIRED for RSA public keys. Base64urlUInt-encoded.
    - "e": Exponent - REQUIRED for RSA public keys. Base64urlUInt-encoded.

    Optional but recommended fields:
    - "kid": Key ID - OPTIONAL. Used for key matching.
    - "use": Public Key Use - OPTIONAL. "sig" (signature) or "enc" (encryption).
    - "alg": Algorithm - OPTIONAL. Identifies the algorithm intended for use.
    - "key_ops": Key Operations - OPTIONAL. Array of permitted operations.

    The JWKS is wrapped in a "keys" array as per RFC 7517 Section 5 (JWK Set).

    Reference: https://datatracker.ietf.org/doc/html/rfc7517
    """
    return {
        "keys": [
            {
                # REQUIRED fields per RFC 7517
                "kty": "RSA",
                "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
                "e": "AQAB",
                # OPTIONAL fields (recommended for production use)
                "kid": "test-key-id",
                "use": "sig",
                "alg": "RS256",
            }
        ]
    }


@pytest.fixture
def mock_oidc_config() -> dict[str, Any]:
    """Return a mock OIDC configuration compliant with OpenID Connect Discovery 1.0.

    OpenID Connect Discovery 1.0 specifies the Provider Metadata format.
    Reference: https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata

    REQUIRED fields per OpenID Connect Discovery 1.0 Section 3:
    - "issuer": REQUIRED. URL using https scheme (http allowed for localhost in dev).
    - "authorization_endpoint": REQUIRED. URL of the OP's Authorization Endpoint.
    - "token_endpoint": REQUIRED (unless only implicit flow is used).
    - "jwks_uri": REQUIRED. URL of the OP's JWK Set document.
    - "response_types_supported": REQUIRED. JSON array of supported response_type values.
    - "subject_types_supported": REQUIRED. JSON array of Subject Identifier types.
    - "id_token_signing_alg_values_supported": REQUIRED. JSON array of JWS alg values.

    RECOMMENDED fields:
    - "userinfo_endpoint": URL of the UserInfo Endpoint.
    - "registration_endpoint": URL of the Dynamic Client Registration Endpoint.
    - "scopes_supported": JSON array of supported scope values.
    - "claims_supported": JSON array of supported claim names.

    Note: RFC 8414 (OAuth 2.0 Authorization Server Metadata) is the base spec,
    and OpenID Connect Discovery extends it with OIDC-specific fields.
    """
    return {
        # REQUIRED fields per OpenID Connect Discovery 1.0
        "issuer": "http://localhost:8080",
        "authorization_endpoint": "http://localhost:8080/oauth/authorize",
        "token_endpoint": "http://localhost:8080/oauth/token",
        "jwks_uri": "http://localhost:8080/.well-known/jwks.json",
        "response_types_supported": ["code", "token", "id_token", "code token"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        # RECOMMENDED fields
        "scopes_supported": ["openid", "profile", "email"],
        "claims_supported": ["sub", "iss", "aud", "exp", "iat", "name", "email"],
        # OPTIONAL fields (commonly included)
        "token_endpoint_auth_methods_supported": [
            "client_secret_basic",
            "client_secret_post",
        ],
        "grant_types_supported": ["authorization_code", "refresh_token"],
    }


# Helper functions for creating forged/malicious tokens


def create_forged_jwt(
    sub: str = "attacker",
    iss: str = "http://localhost:8080",
) -> str:
    """Create a forged JWT with valid structure but invalid/empty signature."""
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "sub": sub,
        "iss": iss,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }

    header_b64 = (
        base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    )
    payload_b64 = (
        base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    )

    # Empty signature - proper implementation must reject this
    return f"{header_b64}.{payload_b64}."


def create_tampered_jwt(
    sub: str = "admin",
    iss: str = "http://localhost:8080",
) -> str:
    """Create a JWT with tampered payload and fake signature."""
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "sub": sub,
        "iss": iss,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }

    header_b64 = (
        base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    )
    payload_b64 = (
        base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    )
    fake_sig = base64.urlsafe_b64encode(b"fake_signature").decode().rstrip("=")

    return f"{header_b64}.{payload_b64}.{fake_sig}"


def create_alg_none_jwt(
    sub: str = "attacker",
    iss: str = "http://localhost:8080",
) -> str:
    """Create a JWT with alg:none (unsecured JWT attack).

    This is a well-known attack vector where an attacker sets alg to 'none'
    to bypass signature verification. A secure implementation MUST reject this.
    """
    header = {"alg": "none", "typ": "JWT"}
    payload = {
        "sub": sub,
        "iss": iss,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }

    header_b64 = (
        base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    )
    payload_b64 = (
        base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    )

    # Empty signature as per the spec for unsecured JWTs
    return f"{header_b64}.{payload_b64}."


def create_missing_alg_jwt(
    sub: str = "attacker",
    iss: str = "http://localhost:8080",
) -> str:
    """Create a JWT without an alg field in the header.

    A secure implementation MUST reject tokens without a valid algorithm.
    """
    header = {"typ": "JWT"}  # Missing 'alg' field
    payload = {
        "sub": sub,
        "iss": iss,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }

    header_b64 = (
        base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    )
    payload_b64 = (
        base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    )

    return f"{header_b64}.{payload_b64}."


class TestGetJwks:
    """Tests for _get_jwks function."""

    @pytest.mark.asyncio
    async def test_raises_error_when_issuer_not_set(self) -> None:
        """Test that _get_jwks raises ValueError when AUTH_OIDC_ISSUER is not set."""
        with patch.object(oidc, "oidc_issuer", ""):
            with pytest.raises(
                ValueError, match="AUTH_OIDC_ISSUER environment variable is not set"
            ):
                await oidc._get_jwks()

    @pytest.mark.asyncio
    async def test_fetches_and_caches_jwks(
        self, mock_oidc_config: dict[str, str], mock_jwks: dict[str, Any]
    ) -> None:
        """Test that _get_jwks fetches JWKS and caches it."""
        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__aenter__.return_value = mock_client

                mock_config_response = MagicMock()
                mock_config_response.json.return_value = mock_oidc_config

                mock_jwks_response = MagicMock()
                mock_jwks_response.json.return_value = mock_jwks

                async def mock_get(url: str) -> MagicMock:
                    if "openid-configuration" in url:
                        return mock_config_response
                    return mock_jwks_response

                mock_client.get = mock_get

                result = await oidc._get_jwks()

                assert result == mock_jwks
                assert oidc._jwks_cache == mock_jwks

    @pytest.mark.asyncio
    async def test_returns_cached_jwks(self, mock_jwks: dict[str, Any]) -> None:
        """Test that _get_jwks returns cached JWKS without fetching."""
        seed_jwks(mock_jwks)

        with patch("httpx.AsyncClient") as mock_client_class:
            result = await oidc._get_jwks()

            mock_client_class.assert_not_called()
            assert result == mock_jwks

    @pytest.mark.asyncio
    async def test_raises_error_when_jwks_uri_missing(
        self, mock_oidc_config: dict[str, str]
    ) -> None:
        """Test that _get_jwks raises ValueError when jwks_uri is missing."""
        config_without_jwks = {
            k: v for k, v in mock_oidc_config.items() if k != "jwks_uri"
        }

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__aenter__.return_value = mock_client

                mock_response = MagicMock()
                mock_response.json.return_value = config_without_jwks

                async def mock_get(url: str) -> MagicMock:
                    return mock_response

                mock_client.get = mock_get

                with pytest.raises(ValueError, match="JWKS URI not found"):
                    await oidc._get_jwks()

    @pytest.mark.asyncio
    async def test_force_refresh_bypasses_cache(
        self, mock_oidc_config: dict[str, str], mock_jwks: dict[str, Any]
    ) -> None:
        """Test that force_refresh=True bypasses the cache and fetches fresh JWKS."""
        old_jwks = {"keys": [{"kid": "old-key"}]}
        seed_jwks(old_jwks)

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__aenter__.return_value = mock_client

                mock_config_response = MagicMock()
                mock_config_response.json.return_value = mock_oidc_config

                mock_jwks_response = MagicMock()
                mock_jwks_response.json.return_value = mock_jwks

                async def mock_get(url: str) -> MagicMock:
                    if "openid-configuration" in url:
                        return mock_config_response
                    return mock_jwks_response

                mock_client.get = mock_get

                result = await oidc._get_jwks(force_refresh=True)

                assert result == mock_jwks
                assert oidc._jwks_cache == mock_jwks


class TestValidateToken:
    """Tests for _validate_token function with cache invalidation."""

    @pytest.mark.asyncio
    async def test_retries_on_key_not_found(self) -> None:
        """Test that _validate_token retries with fresh JWKS when key not found."""
        call_count = 0
        mock_claims = {"sub": "test-user", "iss": "http://localhost:8080"}

        def mock_decode_and_validate(
            token: str, jwks: dict[str, Any]
        ) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ValueError("Key not found")
            return mock_claims

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch.object(
                oidc, "_decode_and_validate", side_effect=mock_decode_and_validate
            ):
                with patch.object(
                    oidc, "_get_jwks", new=AsyncMock(return_value={"keys": []})
                ):
                    result = await oidc._validate_token("test-token")

                    assert result == mock_claims
                    assert call_count == 2

    @pytest.mark.asyncio
    async def test_raises_after_retry_fails(self) -> None:
        """Test that _validate_token raises error if retry also fails."""
        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch.object(
                oidc,
                "_decode_and_validate",
                side_effect=ValueError("Key not found"),
            ):
                with patch.object(
                    oidc, "_get_jwks", new=AsyncMock(return_value={"keys": []})
                ):
                    with pytest.raises(ValueError, match="Key not found"):
                        await oidc._validate_token("test-token")

    @pytest.mark.asyncio
    async def test_does_not_retry_on_other_errors(self) -> None:
        """Test that _validate_token does not retry on non-key-not-found errors."""
        call_count = 0

        def mock_decode_and_validate(
            token: str, jwks: dict[str, Any]
        ) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            raise ValueError("Some other error")

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with patch.object(
                oidc, "_decode_and_validate", side_effect=mock_decode_and_validate
            ):
                with patch.object(
                    oidc, "_get_jwks", new=AsyncMock(return_value={"keys": []})
                ):
                    with pytest.raises(ValueError, match="Some other error"):
                        await oidc._validate_token("test-token")

                    assert call_count == 1


class TestAccessTokenClaims:
    """Signed tokens: iss, aud, sub and exp are all enforced."""

    @pytest.fixture(autouse=True)
    def issuer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(oidc, "oidc_issuer", ISSUER)

    @pytest.fixture
    def key(self) -> Any:
        return JsonWebKey.generate_key("RSA", 2048, {"kid": "k1"}, is_private=True)

    @pytest.fixture
    def jwks(self, key: Any) -> dict[str, Any]:
        return {"keys": [key.as_dict(is_private=False)]}

    def sign(self, key: Any, alg: str = "RS256", **overrides: Any) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {
            "iss": ISSUER,
            "sub": "test-user",
            "aud": API_AUDIENCE,
            "iat": now,
            "exp": now + 300,
            **overrides,
        }
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode({"alg": alg, "kid": "k1"}, claims, key).decode()

    @pytest.mark.asyncio
    async def test_accepts_access_token_for_the_api_audience(
        self, key: Any, jwks: dict[str, Any]
    ) -> None:
        seed_jwks(jwks)

        claims = await oidc._validate_token(self.sign(key))

        assert claims["sub"] == "test-user"

    @pytest.mark.asyncio
    async def test_accepts_audience_list_containing_the_api_audience(
        self, key: Any, jwks: dict[str, Any]
    ) -> None:
        seed_jwks(jwks)

        token = self.sign(key, aud=["other-api", API_AUDIENCE])

        assert (await oidc._validate_token(token))["sub"] == "test-user"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "overrides",
        [
            pytest.param({"aud": "some-client-id"}, id="id-token-style-audience"),
            pytest.param({"aud": ["a", "b"]}, id="audience-list-without-api"),
            pytest.param({"aud": None}, id="missing-audience"),
            pytest.param({"sub": None}, id="missing-subject"),
            pytest.param({"exp": None}, id="missing-expiry"),
            pytest.param({"exp": int(time.time()) - 60}, id="expired"),
            pytest.param({"iss": "http://evil.example"}, id="wrong-issuer"),
        ],
    )
    async def test_rejects_invalid_claims(
        self, key: Any, jwks: dict[str, Any], overrides: dict[str, Any]
    ) -> None:
        seed_jwks(jwks)

        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user(
                {"authorization": f"Bearer {self.sign(key, **overrides)}"}
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_token_signed_by_another_key_with_the_same_kid(
        self, jwks: dict[str, Any]
    ) -> None:
        seed_jwks(jwks)
        other_key = JsonWebKey.generate_key("RSA", 2048, {"kid": "k1"}, is_private=True)

        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user(
                {"authorization": f"Bearer {self.sign(other_key)}"}
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_hmac_signed_token(
        self, key: Any, jwks: dict[str, Any]
    ) -> None:
        seed_jwks(jwks)
        token = jwt.encode(
            {"alg": "HS256"},
            {
                "iss": ISSUER,
                "sub": "x",
                "aud": API_AUDIENCE,
                "exp": int(time.time()) + 60,
            },
            "secret",
        ).decode()

        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user({"authorization": f"Bearer {token}"})

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_fails_closed_when_audience_is_not_configured(
        self, key: Any, jwks: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seed_jwks(jwks)
        monkeypatch.setattr(oidc, "oidc_audience", "")

        with pytest.raises(ValueError, match="AUTH_OIDC_AUDIENCE"):
            await oidc._validate_token(self.sign(key))


class TestGetCurrentUser:
    """Tests for get_current_user function."""

    @pytest.mark.asyncio
    async def test_raises_401_when_no_headers(self) -> None:
        """Test that get_current_user raises 401 when headers are missing."""
        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user(None)

        assert exc_info.value.status_code == 401
        assert "No token provided" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_401_when_no_authorization(self) -> None:
        """Test that get_current_user raises 401 when no authorization header."""
        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user({"content-type": "application/json"})

        assert exc_info.value.status_code == 401
        assert "No token provided" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_401_when_invalid_header_format(self) -> None:
        """Test that get_current_user raises 401 for invalid header format."""
        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user({"authorization": "InvalidHeader"})

        assert exc_info.value.status_code == 401
        assert "Invalid authorization header format" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_401_when_not_bearer_scheme(self) -> None:
        """Test that get_current_user raises 401 for non-Bearer scheme."""
        with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
            await handlers.get_current_user({"authorization": "Basic sometoken"})

        assert exc_info.value.status_code == 401
        assert "Invalid auth scheme" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_returns_user_on_valid_token(self) -> None:
        """Test that get_current_user returns user dict on valid token."""
        mock_claims = {
            "sub": "test-user-123",
            "iss": "http://localhost:8080",
            "permissions": ["read", "write"],
        }

        with patch.object(
            oidc, "_validate_token", new=AsyncMock(return_value=mock_claims)
        ):
            result = await handlers.get_current_user(
                {"authorization": "Bearer valid-token"}
            )

            assert result["identity"] == "test-user-123"
            assert result.get("is_authenticated") is True
            assert result.get("permissions") == ["read", "write"]

    @pytest.mark.asyncio
    async def test_returns_empty_permissions_when_not_in_claims(self) -> None:
        """Test that get_current_user returns empty permissions when not in claims."""
        mock_claims = {
            "sub": "test-user-123",
            "iss": "http://localhost:8080",
        }

        with patch.object(
            oidc, "_validate_token", new=AsyncMock(return_value=mock_claims)
        ):
            result = await handlers.get_current_user(
                {"authorization": "Bearer valid-token"}
            )

            assert result.get("permissions") == []

    @pytest.mark.asyncio
    async def test_rejects_forged_jwt_with_empty_signature(
        self, mock_jwks: dict[str, Any]
    ) -> None:
        """Test that a forged JWT with empty signature is rejected.

        A secure implementation MUST reject this token because the signature
        cannot be verified against the JWKS public keys.
        """
        seed_jwks(mock_jwks)

        forged_token = create_forged_jwt()
        authorization = f"Bearer {forged_token}"

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await handlers.get_current_user({"authorization": authorization})

            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_tampered_jwt_with_fake_signature(
        self, mock_jwks: dict[str, Any]
    ) -> None:
        """Test that a tampered JWT with fake signature is rejected.

        A secure implementation MUST reject this token because the signature
        doesn't match the payload when verified against the JWKS public keys.
        """
        seed_jwks(mock_jwks)

        tampered_token = create_tampered_jwt()
        authorization = f"Bearer {tampered_token}"

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await handlers.get_current_user({"authorization": authorization})

            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_garbage_jwt(self, mock_jwks: dict[str, Any]) -> None:
        """Test that garbage/malformed JWT is rejected."""
        seed_jwks(mock_jwks)

        garbage_token = "not.a.valid.jwt.token"
        authorization = f"Bearer {garbage_token}"

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await handlers.get_current_user({"authorization": authorization})

            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_alg_none_jwt(self, mock_jwks: dict[str, Any]) -> None:
        """Test that a JWT with alg:none (unsecured JWT) is rejected.

        This is a critical security test. The 'alg: none' attack is a well-known
        vulnerability where an attacker sets the algorithm to 'none' to bypass
        signature verification entirely. A secure implementation MUST reject this.

        See: https://docs.authlib.org/en/latest/jose/jwt.html#jwt-with-limited-algorithms
        """
        seed_jwks(mock_jwks)

        forged_token = create_alg_none_jwt()
        authorization = f"Bearer {forged_token}"

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await handlers.get_current_user({"authorization": authorization})

            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_missing_alg_jwt(self, mock_jwks: dict[str, Any]) -> None:
        """Test that a JWT without an alg field is rejected.

        A secure implementation MUST reject tokens that don't specify a valid
        algorithm in the header.
        """
        seed_jwks(mock_jwks)

        forged_token = create_missing_alg_jwt()
        authorization = f"Bearer {forged_token}"

        with patch.object(oidc, "oidc_issuer", "http://localhost:8080"):
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await handlers.get_current_user({"authorization": authorization})

            assert exc_info.value.status_code == 401


class TestAddOwner:
    """Tests for add_owner function."""

    @pytest.mark.asyncio
    async def test_adds_owner_to_metadata(self) -> None:
        """Test that add_owner adds owner to metadata."""
        mock_ctx = MagicMock()
        mock_ctx.user.identity = "test-user-123"

        value: dict[str, Any] = {}

        result = await handlers.add_owner(mock_ctx, value)

        assert result == {"owner": "test-user-123"}
        assert value["metadata"]["owner"] == "test-user-123"

    @pytest.mark.asyncio
    async def test_adds_owner_when_metadata_is_none(self) -> None:
        """Test that add_owner handles a payload with metadata explicitly None.

        Aegra builds handler payloads via model_dump(), so optional metadata
        arrives as None rather than being absent.
        """
        mock_ctx = MagicMock()
        mock_ctx.user.identity = "test-user-123"

        value: dict[str, Any] = {"metadata": None}

        result = await handlers.add_owner(mock_ctx, value)

        assert result == {"owner": "test-user-123"}
        assert value["metadata"]["owner"] == "test-user-123"

    @pytest.mark.asyncio
    async def test_preserves_existing_metadata(self) -> None:
        """Test that add_owner preserves existing metadata."""
        mock_ctx = MagicMock()
        mock_ctx.user.identity = "test-user-123"

        value: dict[str, Any] = {"metadata": {"existing_key": "existing_value"}}

        result = await handlers.add_owner(mock_ctx, value)

        assert result == {"owner": "test-user-123"}
        assert value["metadata"]["owner"] == "test-user-123"
        assert value["metadata"]["existing_key"] == "existing_value"


class TestJwksTtl:
    """The JWKS cache expires; an expired cache is refetched, never reused."""

    TTL = 300.0

    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(oidc, "oidc_issuer", ISSUER)
        monkeypatch.setattr(oidc, "jwks_ttl_seconds", self.TTL)
        self.now = 1000.0
        # Patch the module's clock only, not the global time module.
        monkeypatch.setattr(oidc, "time", MagicMock(monotonic=lambda: self.now))
        self.fetches = 0
        self.idp_jwks: dict[str, Any] = {"keys": []}
        self.idp_down = False
        # Number of upcoming JWKS fetches that fail.
        self.failing_fetches = 0
        # When set, JWKS fetches wait for this event before answering.
        self.gate: asyncio.Event | None = None
        self.fetch_started = asyncio.Event()
        self.in_flight = 0
        self.max_in_flight = 0

    @pytest.fixture
    def key(self) -> Any:
        return JsonWebKey.generate_key("RSA", 2048, {"kid": "k1"}, is_private=True)

    def token(self, key: Any) -> str:
        now = int(time.time())
        claims = {
            "iss": ISSUER,
            "sub": "test-user",
            "aud": API_AUDIENCE,
            "iat": now,
            "exp": now + 300,
        }
        return jwt.encode({"alg": "RS256", "kid": "k1"}, claims, key).decode()

    def fake_idp(self, mock_oidc_config: dict[str, Any]) -> Any:
        outer = self

        class FakeClient:
            async def __aenter__(self) -> "FakeClient":
                return self

            async def __aexit__(self, *args: Any) -> None:
                return None

            async def get(self, url: str) -> MagicMock:
                if outer.idp_down:
                    raise httpx.ConnectError("idp unreachable")
                response = MagicMock()
                if "openid-configuration" in url:
                    response.json.return_value = mock_oidc_config
                else:
                    outer.fetches += 1
                    outer.in_flight += 1
                    outer.max_in_flight = max(outer.max_in_flight, outer.in_flight)
                    outer.fetch_started.set()
                    try:
                        if outer.gate is not None:
                            await outer.gate.wait()
                        if outer.failing_fetches:
                            outer.failing_fetches -= 1
                            raise httpx.ConnectError("idp unreachable")
                    finally:
                        outer.in_flight -= 1
                    response.json.return_value = outer.idp_jwks
                return response

        return patch("httpx.AsyncClient", FakeClient)

    async def authenticate(self, key: Any) -> Any:
        return await handlers.get_current_user(
            {"authorization": f"Bearer {self.token(key)}"}
        )

    @pytest.mark.asyncio
    async def test_no_refetch_inside_ttl(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        with self.fake_idp(mock_oidc_config):
            await self.authenticate(key)
            self.now += self.TTL - 1
            await self.authenticate(key)
        assert self.fetches == 1

    @pytest.mark.asyncio
    async def test_removed_key_is_rejected_after_ttl(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        with self.fake_idp(mock_oidc_config):
            await self.authenticate(key)
            # The IdP removes the key; inside the TTL the cached copy still works.
            self.idp_jwks = {"keys": []}
            await self.authenticate(key)
            self.now += self.TTL
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await self.authenticate(key)
        assert exc_info.value.status_code == 401
        assert self.fetches >= 2

    @pytest.mark.asyncio
    async def test_refresh_failure_after_ttl_is_401(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        with self.fake_idp(mock_oidc_config):
            await self.authenticate(key)
            self.now += self.TTL
            self.idp_down = True
            with pytest.raises(Auth.exceptions.HTTPException) as exc_info:
                await self.authenticate(key)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_zero_ttl_fetches_every_time(
        self,
        key: Any,
        mock_oidc_config: dict[str, Any],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(oidc, "jwks_ttl_seconds", 0.0)
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        with self.fake_idp(mock_oidc_config):
            await self.authenticate(key)
            await self.authenticate(key)
        assert self.fetches == 2

    def expire_cache(self, jwks: dict[str, Any]) -> None:
        """Put a JWKS in the cache that has just expired."""
        oidc._jwks_cache = jwks
        oidc._jwks_fetched_at = self.now
        self.now += self.TTL

    async def run_gated(self, calls: list[Any]) -> list[Any]:
        """Run calls concurrently while the JWKS fetch is held back.

        The fetch is released only after every call has had the chance to
        reach it, then the results (or exceptions) are returned in order.
        """
        self.gate = asyncio.Event()
        tasks = [asyncio.create_task(call) for call in calls]
        await asyncio.wait_for(self.fetch_started.wait(), timeout=5)
        for _ in range(20):
            await asyncio.sleep(0)
        assert not any(task.done() for task in tasks)
        self.gate.set()
        return await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True), timeout=5
        )

    @pytest.mark.asyncio
    async def test_concurrent_requests_after_ttl_share_one_fetch(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        self.expire_cache(self.idp_jwks)
        with self.fake_idp(mock_oidc_config):
            results = await self.run_gated([self.authenticate(key) for _ in range(10)])
        assert self.fetches == 1
        assert [user["identity"] for user in results] == ["test-user"] * 10

    @pytest.mark.asyncio
    async def test_concurrent_unknown_kid_shares_one_forced_fetch(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        old_key = JsonWebKey.generate_key("RSA", 2048, {"kid": "k0"})
        oidc._jwks_cache = {"keys": [old_key.as_dict(is_private=False)]}
        # Fresh, and older than the clock, so a refresh changes the timestamp.
        oidc._jwks_fetched_at = self.now - 1
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        with self.fake_idp(mock_oidc_config):
            results = await self.run_gated([self.authenticate(key) for _ in range(10)])
        assert self.fetches == 1
        assert [user["identity"] for user in results] == ["test-user"] * 10

    @pytest.mark.asyncio
    async def test_failed_fetch_releases_the_lock(
        self, key: Any, mock_oidc_config: dict[str, Any]
    ) -> None:
        self.idp_jwks = {"keys": [key.as_dict(is_private=False)]}
        self.expire_cache(self.idp_jwks)
        self.failing_fetches = 1
        with self.fake_idp(mock_oidc_config):
            first, second = await self.run_gated(
                [self.authenticate(key), self.authenticate(key)]
            )
        # The first fetch fails; the waiting request fetches again and succeeds.
        assert isinstance(first, Auth.exceptions.HTTPException)
        assert first.status_code == 401
        assert second["identity"] == "test-user"
        assert self.fetches == 2
        assert self.max_in_flight == 1
        assert not oidc._jwks_lock.locked()

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [(None, 300.0), ("", 300.0), ("0", 0.0), ("60", 60.0), ("1.5", 1.5)],
    )
    def test_ttl_setting_parses(self, raw: str | None, expected: float) -> None:
        assert oidc._read_jwks_ttl(raw) == expected

    @pytest.mark.parametrize("raw", ["abc", "-1", "nan", "inf", "5m"])
    def test_invalid_ttl_setting_fails_loudly(self, raw: str) -> None:
        with pytest.raises(ValueError, match="AUTH_JWKS_TTL_SECONDS"):
            oidc._read_jwks_ttl(raw)
