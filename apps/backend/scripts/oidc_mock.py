"""Development-only provider: upstream UI/storage/discovery with JWT API tokens.

The private imports are intentionally confined here and pinned to mock 0.3.3.
No part of this launcher is imported by the production application.
"""

import argparse
import hashlib
import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import flask
import uvicorn
from authlib.jose import jwt
from authlib.oauth2.rfc6750 import BearerTokenGenerator
from authlib.oauth2.rfc7636 import CodeChallenge
from oidc_provider_mock import app as provider_app
from oidc_provider_mock._app import (
    AuthorizationCodeGrant,
    OpenIDCode,
    RefreshTokenGrant,
    authorization,
)
from oidc_provider_mock._storage import AuthorizationCode, User, storage


@dataclass(kw_only=True, frozen=True)
class PKCECode(AuthorizationCode):
    code_challenge: str | None
    code_challenge_method: str | None


class PKCEGrant(AuthorizationCodeGrant):
    def save_authorization_code(self, code: str, request: Any):
        super().save_authorization_code(code, request)
        saved = storage.get_authorization_code(code)
        assert saved is not None
        storage.store_authorization_code(
            PKCECode(
                **vars(saved),
                code_challenge=request.payload.data.get("code_challenge"),
                code_challenge_method=request.payload.data.get("code_challenge_method"),
            )
        )


@dataclass
class MockState:
    initial_lifetime: int
    lifetime: int = field(init=False)
    rotate: bool = True
    refresh_error: str | None = None
    padding: int = 0
    attempts: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        self.lifetime = self.initial_lifetime

    def signed_token(self, claims: dict[str, Any]):
        now = int(time.time())
        payload = {
            "iss": flask.request.host_url.rstrip("/"),
            "sub": "test-user",
            "aud": os.getenv("AUTH_OIDC_AUDIENCE", "svelte-langgraph-api"),
            "iat": now,
            "exp": now + self.lifetime,
            "jti": secrets.token_hex(16),
            **claims,
        }
        if self.padding:
            payload["fixture_padding"] = "x" * self.padding
        key = storage.jwk.as_dict(is_private=True)
        return jwt.encode({"alg": "RS256", "kid": key["kid"]}, payload, key).decode()

    def access_token(self, *, user: User, scope: str, **_kwargs: Any):
        return self.signed_token({"sub": user.sub, "scope": scope})

    def record_refresh(self):
        is_refresh = (
            flask.request.path == "/oauth2/token"
            and flask.request.form.get("grant_type") == "refresh_token"
        )
        if not is_refresh:
            return None
        token = flask.request.form.get("refresh_token", "")
        self.attempts.append(
            {
                "credential": hashlib.sha256(token.encode()).hexdigest(),
                "known": storage.get_refresh_token(token) is not None,
            }
        )
        if not self.refresh_error:
            return None
        status = 503 if self.refresh_error == "temporarily_unavailable" else 400
        return flask.jsonify(error=self.refresh_error), status

    def controls(self):
        if flask.request.method == "POST":
            body = flask.request.get_json()
            if body.get("reset"):
                self.lifetime = self.initial_lifetime
                self.rotate = True
                self.refresh_error = None
                self.padding = 0
                self.attempts.clear()
            for name in ("lifetime", "rotate", "refresh_error", "padding"):
                if name in body:
                    setattr(self, name, body[name])
        return flask.jsonify(
            settings={
                "lifetime": self.lifetime,
                "rotate": self.rotate,
                "refresh_error": self.refresh_error,
                "padding": self.padding,
            },
            refreshes=self.attempts,
        )

    def mint_test_token(self):
        return flask.jsonify(accessToken=self.signed_token(flask.request.get_json()))


def rotating_refresh_grant(state: MockState):
    class RotatingRefreshGrant(RefreshTokenGrant):
        TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_basic", "client_secret_post"]
        INCLUDE_NEW_REFRESH_TOKEN = True

        def issue_token(self, user: User, refresh_token: Any):
            self.INCLUDE_NEW_REFRESH_TOKEN = state.rotate
            return super().issue_token(user, refresh_token)

        def revoke_old_credential(self, refresh_token: Any):
            super().revoke_old_credential(refresh_token)
            if state.rotate:
                storage.remove_refresh_token(refresh_token.token)

    return RotatingRefreshGrant


def configure_authorization(app, state: MockState, lifetime: int):
    # The mock keeps its AuthorizationServer in Flask request globals. Configure
    # that existing server once, leaving every provider route and store intact.
    with app.test_request_context():
        app.preprocess_request()
        authorization.register_token_generator(
            "default",
            BearerTokenGenerator(
                access_token_generator=state.access_token,
                refresh_token_generator=lambda **_: secrets.token_urlsafe(32),
                expires_generator=lambda *_: state.lifetime,
            ),
        )
        # Authlib has no unregister API; these two registries are the sole
        # private integration seam, covered by the provider flow tests.
        authorization._authorization_grants.clear()  # pyright: ignore[reportAttributeAccessIssue]
        authorization._token_grants.clear()  # pyright: ignore[reportAttributeAccessIssue]
        authorization.register_grant(
            PKCEGrant,
            [
                OpenIDCode(
                    require_nonce=True, token_max_age=timedelta(seconds=lifetime)
                ),
                CodeChallenge(required=True),
            ],
        )
        # No OpenIDToken extension: real providers may omit id_token on refresh.
        authorization.register_grant(rotating_refresh_grant(state))


def register_test_controls(app, state: MockState):
    app.before_request(state.record_refresh)
    app.add_url_rule(
        "/__test__/settings",
        endpoint="test_settings",
        view_func=state.controls,
        methods=["GET", "POST"],
    )
    app.add_url_rule(
        "/__test__/token",
        endpoint="test_token",
        view_func=state.mint_test_token,
        methods=["POST"],
    )


def create_app(*, lifetime: int = 3600, test_controls: bool = False):
    os.environ["AUTHLIB_INSECURE_TRANSPORT"] = "1"
    app = provider_app(
        access_token_max_age=timedelta(seconds=lifetime),
        require_nonce=True,
        user_claims=[
            User(sub=name, claims={"email": f"{name}@example.test", "name": name})
            for name in ("test-user", "other-user")
        ],
    )
    state = MockState(lifetime)
    configure_authorization(app, state, lifetime)

    if test_controls:
        register_test_controls(app, state)

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token-max-age", type=int, default=3600)
    parser.add_argument("--test-controls", action="store_true")
    args = parser.parse_args()
    uvicorn.run(
        create_app(lifetime=args.token_max_age, test_controls=args.test_controls),
        interface="wsgi",
        host="localhost",
        port=8080,
    )
