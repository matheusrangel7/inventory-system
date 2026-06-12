from datetime import timedelta
from http.cookies import SimpleCookie

from flask import Flask, make_response
from flask_jwt_extended import JWTManager, create_access_token

from app.constants import (
    PASSWORD_CHANGE_STEP_COOKIE_NAME,
    PASSWORD_CHANGE_STEP_COOKIE_PATH,
)
from app.utils import cookie_helpers


def make_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        JWT_SECRET_KEY="test-password-change-secret-with-adequate-length",
        JWT_COOKIE_SECURE=True,
    )
    JWTManager(app)
    return app


def extract_cookie(response, name):
    cookies = SimpleCookie()
    for header in response.headers.getlist("Set-Cookie"):
        cookies.load(header)
    return cookies[name]


def test_password_change_step_cookie_is_scoped_and_http_only():
    app = make_app()

    with app.test_request_context("/api/auth/password-change/confirm"):
        response = make_response("ok")
        cookie_helpers.set_password_change_step_cookie(
            response,
            user_id=7,
            password_fingerprint="fingerprint",
            access_jti="access-jti",
        )

    cookie = extract_cookie(response, PASSWORD_CHANGE_STEP_COOKIE_NAME)
    assert cookie["httponly"]
    assert cookie["secure"]
    assert cookie["samesite"] == "Strict"
    assert cookie["path"] == PASSWORD_CHANGE_STEP_COOKIE_PATH


def test_valid_password_change_step_cookie_returns_bound_claims():
    app = make_app()

    with app.test_request_context("/api/auth/password-change/confirm"):
        response = make_response("ok")
        cookie_helpers.set_password_change_step_cookie(
            response,
            user_id=7,
            password_fingerprint="fingerprint",
            access_jti="access-jti",
        )
    token = extract_cookie(response, PASSWORD_CHANGE_STEP_COOKIE_NAME).value

    with app.test_request_context(
        "/api/auth/password-change/complete",
        headers={"Cookie": f"{PASSWORD_CHANGE_STEP_COOKIE_NAME}={token}"},
    ):
        claims = cookie_helpers.get_password_change_step_claims()

    assert claims["sub"] == "7"
    assert claims["password_fingerprint"] == "fingerprint"
    assert claims["access_jti"] == "access-jti"


def test_tampered_or_expired_password_change_step_cookie_is_rejected():
    app = make_app()

    with app.app_context():
        expired_token = create_access_token(
            identity="7",
            additional_claims={
                "token_use": "password_change_step",
                "password_change_confirmed": True,
                "password_fingerprint": "fingerprint",
                "access_jti": "access-jti",
            },
            expires_delta=timedelta(seconds=-1),
        )

    for token in (f"{expired_token}tampered", expired_token):
        with app.test_request_context(
            "/api/auth/password-change/complete",
            headers={"Cookie": f"{PASSWORD_CHANGE_STEP_COOKIE_NAME}={token}"},
        ):
            assert cookie_helpers.get_password_change_step_claims() is None


def test_clearing_authentication_also_clears_password_change_step():
    app = make_app()

    with app.test_request_context("/api/auth/logout"):
        response = make_response("ok")
        cookie_helpers.clear_auth_cookies(response)

    cookie = extract_cookie(response, PASSWORD_CHANGE_STEP_COOKIE_NAME)
    assert cookie.value == ""
    assert cookie["path"] == PASSWORD_CHANGE_STEP_COOKIE_PATH
