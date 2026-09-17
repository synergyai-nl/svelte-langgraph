"""Development-only provider: upstream UI/storage/discovery with JWT API tokens.

The private imports are intentionally confined here and pinned to mock 0.3.3.
No part of this launcher is imported by the production application.
"""

import argparse
import hashlib
import os
import secrets
import time
from dataclasses import dataclass
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
    settings: dict[str, Any] = {
        "lifetime": lifetime,
        "rotate": True,
        "refresh_error": None,
        "padding": 0,
    }
    attempts: list[dict[str, Any]] = []

    def signed_token(claims: dict[str, Any]):
        now = int(time.time())
        payload = {
            "iss": flask.request.host_url.rstrip("/"),
            "sub": "test-user",
            "aud": os.getenv("AUTH_OIDC_AUDIENCE", "svelte-langgraph-api"),
            "iat": now,
            "exp": now + settings["lifetime"],
            "jti": secrets.token_hex(16),
            **claims,
        }
        if settings["padding"]:
            payload["fixture_padding"] = "x" * settings["padding"]
        key = storage.jwk.as_dict(is_private=True)
        return jwt.encode({"alg": "RS256", "kid": key["kid"]}, payload, key).decode()

    def access_token(*, user: User, scope: str, **_kwargs: Any):
        return signed_token({"sub": user.sub, "scope": scope})

    class RotatingRefreshGrant(RefreshTokenGrant):
        TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_basic", "client_secret_post"]
        INCLUDE_NEW_REFRESH_TOKEN = True

        def issue_token(self, user: User, refresh_token: Any):
            self.INCLUDE_NEW_REFRESH_TOKEN = settings["rotate"]
            return super().issue_token(user, refresh_token)

        def revoke_old_credential(self, refresh_token: Any):
            super().revoke_old_credential(refresh_token)
            if settings["rotate"]:
                storage.remove_refresh_token(refresh_token.token)

    # The mock keeps its AuthorizationServer in Flask request globals. Configure
    # that existing server once, leaving every provider route and store intact.
    with app.test_request_context():
        app.preprocess_request()
        authorization.register_token_generator(
            "default",
            BearerTokenGenerator(
                access_token_generator=access_token,
                refresh_token_generator=lambda **_: secrets.token_urlsafe(32),
                expires_generator=lambda *_: settings["lifetime"],
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
        authorization.register_grant(RotatingRefreshGrant)

    if test_controls:

        @app.before_request
        def record_refresh():
            if (
                flask.request.path == "/oauth2/token"
                and flask.request.form.get("grant_type") == "refresh_token"
            ):
                token = flask.request.form.get("refresh_token", "")
                attempts.append(
                    {
                        "credential": hashlib.sha256(token.encode()).hexdigest(),
                        "known": storage.get_refresh_token(token) is not None,
                    }
                )
                error = settings["refresh_error"]
                if error:
                    return flask.jsonify(error=error), (
                        503 if error == "temporarily_unavailable" else 400
                    )

        @app.route("/__test__/settings", methods=["GET", "POST"])
        def controls():
            if flask.request.method == "POST":
                body = flask.request.get_json()
                if body.get("reset"):
                    settings.update(
                        lifetime=lifetime, rotate=True, refresh_error=None, padding=0
                    )
                    attempts.clear()
                settings.update({k: v for k, v in body.items() if k in settings})
            return flask.jsonify(settings=settings, refreshes=attempts)

        @app.post("/__test__/token")
        def mint_test_token():
            return flask.jsonify(accessToken=signed_token(flask.request.get_json()))

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
