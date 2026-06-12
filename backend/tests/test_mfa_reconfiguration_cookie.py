from datetime import timedelta
from http.cookies import SimpleCookie

from flask import Flask, make_response
from flask_jwt_extended import JWTManager, create_access_token

from app.constants import (
    MFA_RECONFIGURATION_STEP_COOKIE_NAME,
    MFA_RECONFIGURATION_STEP_COOKIE_PATH,
)
from app.utils import cookie_helpers


def make_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        JWT_SECRET_KEY="test-mfa-reconfiguration-secret-with-adequate-length",
        JWT_COOKIE_SECURE=True,
    )
    JWTManager(app)
    return app


def extract_cookie(response, name):
    cookies = SimpleCookie()
    for header in response.headers.getlist("Set-Cookie"):
        cookies.load(header)
    return cookies[name]


def test_mfa_reconfiguration_cookie_is_scoped_secure_and_bound():
    app = make_app()

    with app.test_request_context("/api/auth/mfa-reconfiguration/start"):
        response = make_response("ok")
        cookie_helpers.set_mfa_reconfiguration_step_cookie(
            response,
            user_id=7,
            reconfiguration_id=11,
            password_fingerprint="password-fingerprint",
            totp_fingerprint="totp-fingerprint",
            access_jti="access-jti",
        )

    cookie = extract_cookie(response, MFA_RECONFIGURATION_STEP_COOKIE_NAME)
    assert cookie["httponly"]
    assert cookie["secure"]
    assert cookie["samesite"] == "Strict"
    assert cookie["path"] == MFA_RECONFIGURATION_STEP_COOKIE_PATH

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/complete",
        headers={
            "Cookie": f"{MFA_RECONFIGURATION_STEP_COOKIE_NAME}={cookie.value}"
        },
    ):
        claims = cookie_helpers.get_mfa_reconfiguration_step_claims()

    assert claims["sub"] == "7"
    assert claims["reconfiguration_id"] == 11
    assert claims["password_fingerprint"] == "password-fingerprint"
    assert claims["totp_fingerprint"] == "totp-fingerprint"
    assert claims["access_jti"] == "access-jti"


def test_expired_or_tampered_mfa_reconfiguration_cookie_is_rejected():
    app = make_app()

    with app.app_context():
        expired_token = create_access_token(
            identity="7",
            additional_claims={
                "token_use": "mfa_reconfiguration_step",
                "reconfiguration_id": 11,
                "password_fingerprint": "password-fingerprint",
                "totp_fingerprint": "totp-fingerprint",
                "access_jti": "access-jti",
            },
            expires_delta=timedelta(seconds=-1),
        )

    for token in (expired_token, f"{expired_token}tampered"):
        with app.test_request_context(
            "/api/auth/mfa-reconfiguration/complete",
            headers={
                "Cookie": f"{MFA_RECONFIGURATION_STEP_COOKIE_NAME}={token}"
            },
        ):
            assert cookie_helpers.get_mfa_reconfiguration_step_claims() is None


def test_authentication_cleanup_clears_mfa_reconfiguration_cookie():
    app = make_app()

    with app.test_request_context("/api/auth/logout"):
        response = make_response("ok")
        cookie_helpers.clear_auth_cookies(response)

    cookie = extract_cookie(response, MFA_RECONFIGURATION_STEP_COOKIE_NAME)
    assert cookie.value == ""
    assert cookie["path"] == MFA_RECONFIGURATION_STEP_COOKIE_PATH
