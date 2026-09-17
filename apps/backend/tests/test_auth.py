"""Real signed access tokens exercise the shared runtime authentication boundary."""

import base64
import json
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx
from authlib.jose import JsonWebKey, JsonWebToken

from svelte_langgraph import auth

ISSUER = "https://issuer.example"
AUDIENCE = "svelte-langgraph-api"
JWKS_URL = f"{ISSUER}/jwks"


@pytest.fixture(autouse=True)
def env_setup(monkeypatch):
    """Override graph-model parametrization: auth has no model dependency."""
    monkeypatch.setenv("AUTH_OIDC_ISSUER", ISSUER)
    monkeypatch.setenv("AUTH_OIDC_AUDIENCE", AUDIENCE)
    auth._jwks_cache = None


@pytest.fixture(scope="module")
def signing_keys():
    return [
        JsonWebKey.generate_key("RSA", 2048, {"kid": kid}, is_private=True)
        for kid in ("initial", "rotated")
    ]


@pytest.fixture
def jwks(signing_keys):
    result = {"keys": [signing_keys[0].as_dict(is_private=False)]}
    auth._jwks_cache = result
    return result


@pytest.fixture
def token(signing_keys, jwks):
    def create(changes=None, *, omit=(), key_index=0, algorithm="RS256"):
        claims = {
            "iss": ISSUER,
            "sub": "user-a",
            "aud": AUDIENCE,
            "exp": int(time.time()) + 120,
            "iat": int(time.time()) - 1,
        }
        claims.update(changes or {})
        for name in omit:
            claims.pop(name, None)
        key = signing_keys[key_index]
        return (
            JsonWebToken([algorithm])
            .encode({"alg": algorithm, "kid": key.kid}, claims, key)
            .decode()
        )

    return create


async def authenticate(token: str):
    return await auth.get_current_user({"authorization": f"Bearer {token}"})


@pytest.mark.parametrize("algorithm", ["RS256", "RS384", "RS512"])
@pytest.mark.parametrize("audience", [AUDIENCE, ["another-api", AUDIENCE]])
async def test_accepts_access_token(token, algorithm, audience):
    user = await authenticate(
        token({"aud": audience, "permissions": ["read"]}, algorithm=algorithm)
    )
    assert user == {
        "identity": "user-a",
        "is_authenticated": True,
        "permissions": ["read"],
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"iss": ISSUER + "/"},
        {"iss": "https://attacker.example"},
        {"aud": "frontend-client-id"},
        {"aud": ["frontend-client-id", "another-api"]},
        {"aud": [AUDIENCE, 123]},
        {"aud": {"api": AUDIENCE}},
        {"sub": ""},
        {"sub": "   "},
        {"sub": 123},
        {"sub": None},
        {"exp": 1},
        {"exp": "9999999999"},
        {"exp": True},
        {"exp": float("inf")},
        {"exp": float("nan")},
        {"nbf": 9999999999},
        {"nbf": True},
        {"iat": 9999999999},
    ],
)
async def test_rejects_invalid_claims(token, changes):
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(token(changes))
    assert error.value.status_code == 401
    assert error.value.detail == "Invalid or expired access token"


@pytest.mark.parametrize("claim", ["iss", "sub", "aud", "exp"])
async def test_requires_access_token_claims(token, claim):
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(token(omit=[claim]))
    assert error.value.status_code == 401


async def test_issuer_is_exact_even_when_config_has_trailing_slash(token, monkeypatch):
    monkeypatch.setenv("AUTH_OIDC_ISSUER", ISSUER + "/")
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(token())
    assert error.value.status_code == 401
    assert (await authenticate(token({"iss": ISSUER + "/"})))["identity"] == "user-a"


@pytest.mark.parametrize(
    "headers",
    [
        None,
        {},
        {"authorization": "Basic abc"},
        {"authorization": "Bearer"},
        {"authorization": "Bearer a b"},
        {"authorization": ""},
    ],
)
async def test_rejects_missing_or_invalid_bearer(headers):
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await auth.get_current_user(headers)
    assert error.value.status_code == 401


@pytest.mark.parametrize("header", ["authorization", "Authorization", "AUTHORIZATION"])
@pytest.mark.parametrize("as_bytes", [False, True])
async def test_runtime_header_representations(token, header, as_bytes):
    value = f"bEaReR {token()}"
    headers = {header.encode(): value.encode()} if as_bytes else {header: value}
    assert (await auth.get_current_user(headers))["identity"] == "user-a"


async def test_rejects_modified_signature_without_refresh(token):
    encoded = token()
    header, payload, signature = encoded.split(".")
    signature = ("A" if signature[0] != "A" else "B") + signature[1:]
    with patch.object(auth, "_get_jwks", wraps=auth._get_jwks) as get_keys:
        with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
            await authenticate(f"{header}.{payload}.{signature}")
    assert error.value.status_code == 401
    assert get_keys.call_count == 1


@pytest.mark.parametrize("algorithm", ["none", "HS256", None])
async def test_rejects_unsupported_or_missing_algorithm(token, algorithm):
    _, payload, _ = token().split(".")
    header = {"typ": "JWT"}
    if algorithm is not None:
        header["alg"] = algorithm
    encoded = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(f"{encoded}.{payload}.")
    assert error.value.status_code == 401


@pytest.mark.parametrize("encoded", ["opaque-provider-token", "a.b.c", ".."])
async def test_rejects_malformed_and_opaque_tokens(token, encoded):
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(encoded)
    assert error.value.status_code == 401


def discovery_mock(mock, keys):
    discovery = mock.get(f"{ISSUER}/.well-known/openid-configuration").respond(
        200, json={"issuer": ISSUER, "jwks_uri": JWKS_URL}
    )
    jwks = mock.get(JWKS_URL).respond(200, json=keys)
    return discovery, jwks


async def test_fetches_then_caches_keys(token, jwks):
    encoded = token()
    auth._jwks_cache = None
    with respx.mock as mock:
        discovery, key_request = discovery_mock(mock, jwks)
        await authenticate(encoded)
        await authenticate(encoded)
        assert discovery.call_count == key_request.call_count == 1


async def test_unknown_key_refreshes_once_and_persists_new_keys(token, signing_keys):
    rotated = {"keys": [signing_keys[1].as_dict(is_private=False)]}
    with respx.mock as mock:
        discovery, key_request = discovery_mock(mock, rotated)
        user = await authenticate(token(key_index=1))
        await authenticate(token(key_index=1))
        assert user["identity"] == "user-a"
        assert discovery.call_count == key_request.call_count == 1
    assert auth._jwks_cache == rotated


async def test_unknown_key_still_missing_is_401_without_retry_loop(token, jwks):
    with respx.mock as mock:
        discovery, key_request = discovery_mock(mock, jwks)
        with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
            await authenticate(token(key_index=1))
        assert discovery.call_count == key_request.call_count == 1
    assert error.value.status_code == 401


@pytest.mark.parametrize("name", ["AUTH_OIDC_ISSUER", "AUTH_OIDC_AUDIENCE"])
async def test_missing_config_is_operational_even_with_cached_keys(
    token, monkeypatch, name
):
    encoded = token()
    monkeypatch.delenv(name)
    with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
        await authenticate(encoded)
    assert error.value.status_code == 503


@pytest.mark.parametrize(
    "discovery",
    [
        {},
        [],
        {"issuer": "https://wrong.example", "jwks_uri": JWKS_URL},
        {"issuer": ISSUER, "jwks_uri": None},
    ],
)
async def test_invalid_discovery_is_operational(token, discovery):
    encoded = token()
    auth._jwks_cache = None
    with respx.mock as mock:
        mock.get(f"{ISSUER}/.well-known/openid-configuration").respond(
            200, json=discovery
        )
        with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
            await authenticate(encoded)
    assert error.value.status_code == 503


@pytest.mark.parametrize("keys", [{}, {"keys": []}, {"keys": [{"kty": "RSA"}]}])
async def test_invalid_jwks_is_operational(token, keys):
    encoded = token()
    auth._jwks_cache = None
    with respx.mock as mock:
        discovery_mock(mock, keys)
        with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
            await authenticate(encoded)
    assert error.value.status_code == 503


async def test_network_failure_is_operational_and_does_not_leak_token(token, caplog):
    encoded = token()
    with patch.object(
        auth, "_get_jwks", new=AsyncMock(side_effect=httpx.ConnectError(encoded))
    ):
        with pytest.raises(auth.Auth.exceptions.HTTPException) as error:
            await authenticate(encoded)
    assert error.value.status_code == 503
    assert encoded not in error.value.detail
    assert encoded not in caplog.text


@pytest.mark.parametrize("metadata", [None, {}, {"label": "keep", "owner": "attacker"}])
async def test_owner_filter_overwrites_spoofed_owner_and_keeps_metadata(metadata):
    ctx = MagicMock()
    ctx.user.identity = "user-a"
    value: dict[str, Any] = {"metadata": metadata}
    result = await auth.add_owner(ctx, value)
    assert result == {"owner": "user-a"}
    assert value["metadata"]["owner"] == "user-a"
    if metadata and "label" in metadata:
        assert value["metadata"]["label"] == "keep"
