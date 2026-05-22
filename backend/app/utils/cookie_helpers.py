from datetime import timedelta
from flask import make_response, current_app, request
from flask_jwt_extended import (
    create_access_token,
    decode_token,
    set_access_cookies,
    unset_jwt_cookies,
)
from jwt.exceptions import PyJWTError
from app.utils.responses import success
from app.constants import (
    REFRESH_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_PATH,
    REFRESH_TOKEN_DAYS,
    MFA_STEP_COOKIE_NAME,
    MFA_STEP_COOKIE_PATH,
    STEP_TOKEN_MINUTES,
)


def set_auth_cookies(response, user, refresh_token: str):
    access_token = create_access_token(
        identity=str(user.user_id),
        additional_claims={"role": user.role, "email": user.email},
    )

    secure = current_app.config.get("JWT_COOKIE_SECURE", True)

    set_access_cookies(response, access_token)
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=_days_to_seconds(REFRESH_TOKEN_DAYS),
        path=REFRESH_TOKEN_PATH,
    )
    return response


def clear_auth_cookies(response):
    unset_jwt_cookies(response)
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, path=REFRESH_TOKEN_PATH)
    return response


def build_auth_response(user, refresh_token: str, data: dict):
    resp_body, status = success(data=data)
    response = make_response(resp_body, status)
    return set_auth_cookies(response, user, refresh_token)


def _days_to_seconds(days: int) -> int:
    return days * 24 * 60 * 60


# MFA Cookies
def set_mfa_step_cookie(response, user_id: int, claims: dict):
    token = create_access_token(
        identity=str(user_id),
        additional_claims=claims,
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
        return decode_token(token)
    except PyJWTError:
        return None
