import hmac
import hashlib
from datetime import timedelta

from flask import make_response, current_app, request
from flask_jwt_extended import (
    create_access_token,
    decode_token,
    get_csrf_token,
    set_access_cookies,
    unset_jwt_cookies,
)
from jwt.exceptions import PyJWTError

from app.utils.responses import success
from app.constants import (
    REFRESH_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_PATH,
    REFRESH_TOKEN_HOURS,
    ACCESS_TOKEN_MINUTES,
    REFRESH_CSRF_COOKIE_NAME,
    MFA_STEP_COOKIE_NAME,
    MFA_STEP_COOKIE_PATH,
    STEP_TOKEN_MINUTES,
)


def set_auth_cookies(response, user, refresh_token: str):
    access_token = create_access_token(
        identity=str(user.user_id),
        additional_claims={"token_use": "access"},
    )

    secure = current_app.config.get("JWT_COOKIE_SECURE", True)
    max_age = _hours_to_seconds(REFRESH_TOKEN_HOURS)

    set_access_cookies(response, access_token)
    set_access_csrf_cookie(response, access_token)

    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=max_age,
        path=REFRESH_TOKEN_PATH,
    )
    response.set_cookie(
        REFRESH_CSRF_COOKIE_NAME,
        value=build_refresh_csrf_token(refresh_token),
        httponly=False,
        secure=secure,
        samesite="Strict",
        max_age=max_age,
        path="/",
    )
    return response




def set_access_csrf_cookie(response, access_token: str):
    """Garante que o cookie csrf_access_token é recriado sempre que há novo access token.

    Em desenvolvimento, o flask-jwt-extended pode não escrever este cookie quando
    JWT_COOKIE_CSRF_PROTECT está desligado. Em produção ele é necessário para
    POST/PUT/DELETE com autenticação por cookies, por isso mantemo-lo sempre
    sincronizado com o access token emitido.
    """
    try:
        csrf_token = get_csrf_token(access_token)
    except Exception:
        csrf_token = ""

    if not csrf_token:
        return response

    secure = current_app.config.get("JWT_COOKIE_SECURE", True)
    response.set_cookie(
        current_app.config.get("JWT_ACCESS_CSRF_COOKIE_NAME", "csrf_access_token"),
        value=csrf_token,
        httponly=False,
        secure=secure,
        samesite=current_app.config.get("JWT_COOKIE_SAMESITE", "Lax"),
        max_age=_minutes_to_seconds(ACCESS_TOKEN_MINUTES),
        path=current_app.config.get("JWT_ACCESS_CSRF_COOKIE_PATH", "/"),
    )
    return response


def clear_auth_cookies(response):
    unset_jwt_cookies(response)
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, path=REFRESH_TOKEN_PATH)
    response.delete_cookie(REFRESH_CSRF_COOKIE_NAME, path="/")
    return response


def build_auth_response(user, refresh_token: str, data: dict):
    resp_body, status = success(data=data)
    response = make_response(resp_body, status)
    return set_auth_cookies(response, user, refresh_token)


def build_refresh_csrf_token(refresh_token: str) -> str:
    secret = current_app.config.get("SECRET_KEY") or current_app.config.get("JWT_SECRET_KEY")
    return hmac.new(
        str(secret).encode("utf-8"),
        refresh_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _hours_to_seconds(hours: float | int) -> int:
    return int(float(hours) * 60 * 60)


def _minutes_to_seconds(minutes: float | int) -> int:
    return int(float(minutes) * 60)


# MFA Cookies
def set_mfa_step_cookie(response, user_id: int, claims: dict):
    token = create_access_token(
        identity=str(user_id),
        additional_claims={**claims, "token_use": "mfa_step"},
        expires_delta=timedelta(minutes=STEP_TOKEN_MINUTES),
    )
    secure = current_app.config.get("JWT_COOKIE_SECURE", True)
    response.set_cookie(
        MFA_STEP_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=STEP_TOKEN_MINUTES * 60,
        path=MFA_STEP_COOKIE_PATH,
    )
    return response


def clear_mfa_step_cookie(response):
    response.delete_cookie(MFA_STEP_COOKIE_NAME, path=MFA_STEP_COOKIE_PATH)
    return response


def get_mfa_step_claims():
    token = request.cookies.get(MFA_STEP_COOKIE_NAME)
    if not token:
        return None
    try:
        claims = decode_token(token)
    except PyJWTError:
        return None
    return claims if claims.get("token_use") == "mfa_step" else None
