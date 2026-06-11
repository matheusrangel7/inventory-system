import io
import base64
import hmac
import secrets
import time
import qrcode

from flask import Blueprint, current_app, g, make_response, request

from app.services import (
    auth_service,
    mfa_enrollment_service,
    mfa_service,
    password_reset_service,
    session_service,
)
from app.utils.cookie_helpers import (
    build_auth_response,
    clear_auth_cookies,
    set_mfa_step_cookie,
    get_mfa_step_claims,
    clear_mfa_step_cookie,
    build_refresh_csrf_token,
)
from app.utils.responses import success, error
from app.extensions import limiter
from app.constants import (
    CSRF_HEADER_NAME,
    LOGIN_RATE_LIMIT,
    PASSWORD_RESET_COMPLETE_RATE_LIMIT,
    PASSWORD_RESET_REQUEST_RATE_LIMIT,
    PASSWORD_RESET_RESPONSE_JITTER_MILLISECONDS,
    PASSWORD_RESET_RESPONSE_MIN_SECONDS,
    PASSWORD_RESET_VALIDATE_RATE_LIMIT,
    REFRESH_CSRF_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
)
from app.security.permissions import permissions_for_role
from app.utils.decorators import authenticated_user_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _csrf_enabled() -> bool:
    return bool(current_app.config.get("JWT_COOKIE_CSRF_PROTECT", False))


def _refresh_csrf_error():
    return error("Token CSRF inválido ou ausente.", status=401)


def _validate_refresh_csrf(refresh_token: str):
    if not _csrf_enabled():
        return None

    csrf_header = request.headers.get(CSRF_HEADER_NAME) or request.headers.get("X-CSRFToken")
    csrf_cookie = request.cookies.get(REFRESH_CSRF_COOKIE_NAME)

    if not csrf_header or not csrf_cookie:
        return _refresh_csrf_error()

    expected = build_refresh_csrf_token(refresh_token)
    if not hmac.compare_digest(csrf_cookie, csrf_header):
        return _refresh_csrf_error()
    if not hmac.compare_digest(csrf_cookie, expected):
        return _refresh_csrf_error()

    return None


def _get_user_id_from_claims(claims: dict) -> int | None:
    try:
        return int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def _delay_password_reset_response(started_at: float) -> None:
    jitter_seconds = (
        secrets.randbelow(PASSWORD_RESET_RESPONSE_JITTER_MILLISECONDS + 1) / 1000
    )
    target_duration = PASSWORD_RESET_RESPONSE_MIN_SECONDS + jitter_seconds
    remaining = target_duration - (time.monotonic() - started_at)
    if remaining > 0:
        time.sleep(remaining)


@auth_bp.route("/password-reset/request", methods=["POST"])
@limiter.limit(PASSWORD_RESET_REQUEST_RATE_LIMIT)
def request_password_reset():
    data = request.get_json(silent=True)
    email = (data or {}).get("email", "").strip().lower()

    if not email:
        return error("Email obrigatório.", status=400)

    started_at = time.monotonic()
    try:
        message = password_reset_service.request_password_reset(email)
    finally:
        _delay_password_reset_response(started_at)

    return success(message=message)


@auth_bp.route("/password-reset/validate", methods=["GET"])
@limiter.limit(PASSWORD_RESET_VALIDATE_RATE_LIMIT)
def validate_password_reset():
    token = request.args.get("token", "").strip()
    if not password_reset_service.is_reset_token_valid(token):
        return error(password_reset_service.INVALID_TOKEN_MESSAGE, status=400)
    return success(message="Link de recuperação válido.")


@auth_bp.route("/password-reset/complete", methods=["POST"])
@limiter.limit(PASSWORD_RESET_COMPLETE_RATE_LIMIT)
def complete_password_reset():
    data = request.get_json(silent=True)
    token = (data or {}).get("token", "").strip()
    password = (data or {}).get("password", "")

    if not token or not password:
        return error("Token e palavra-passe são obrigatórios.", status=400)

    ok, message = password_reset_service.complete_password_reset(token, password)
    if not ok:
        return error(message, status=400)
    return success(message=message)


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(LOGIN_RATE_LIMIT)
def login():
    data = request.get_json(silent=True)

    if not data:
        return error("Body JSON inválido ou ausente.", status=400)

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return error("Email e password são obrigatórios.", status=400)

    ok, message, user = auth_service.login_user(email, password)

    if not ok:
        return error(message, status=401)

    if mfa_service.needs_mfa_enrollment(user):
        resp_body, status = success(data={"mfa_setup_required": True})
        response = make_response(resp_body, status)
        set_mfa_step_cookie(
            response,
            user.user_id,
            {"mfa_enrollment": True, "role": user.role},
        )
        return response

    if mfa_service.is_mfa_ready(user):
        resp_body, status = success(data={"mfa_required": True})
        response = make_response(resp_body, status)
        set_mfa_step_cookie(
            response,
            user.user_id,
            {"mfa_pending": True, "role": user.role},
        )
        return response

    return error("Configuração MFA inválida. Contacte o administrador.", status=403)


@auth_bp.route("/enroll-mfa/setup", methods=["POST"])
@limiter.limit("5 per minute")
def enroll_mfa_setup():
    decoded = get_mfa_step_claims()
    if not decoded or not decoded.get("mfa_enrollment"):
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    user_id = _get_user_id_from_claims(decoded)
    if user_id is None:
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    ok, message, secret, otp_uri = mfa_service.setup_mfa(user_id)

    if not ok:
        return error(message, status=400)

    img = qrcode.make(otp_uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_b64 = base64.b64encode(buffer.getvalue()).decode()

    return success(data={"qr_code": f"data:image/png;base64,{qr_b64}"})


@auth_bp.route("/enroll-mfa/confirm", methods=["POST"])
@limiter.limit("5 per minute")
def enroll_mfa_confirm():
    decoded = get_mfa_step_claims()
    if not decoded or not decoded.get("mfa_enrollment"):
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido.", status=400)

    code = data.get("code", "").strip()
    user_id = _get_user_id_from_claims(decoded)
    if user_id is None:
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    if not code:
        return error("Código TOTP obrigatório.", status=400)

    ok, message = mfa_enrollment_service.confirm_enrollment(user_id, code)
    if not ok:
        return error(message, status=400)

    user = auth_service.get_active_completed_user(user_id)
    if not user:
        return error("Utilizador inválido.", status=401)

    ip = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")
    refresh_token = session_service.create_session(user_id, ip, user_agent)

    response = build_auth_response(
        user=user,
        refresh_token=refresh_token,
        data={"user_id": user.user_id, "email": user.email, "role": user.role},
    )

    return clear_mfa_step_cookie(response)


@auth_bp.route("/verify-mfa", methods=["POST"])
@limiter.limit("5 per minute")
def verify_mfa():
    decoded = get_mfa_step_claims()
    if not decoded or not decoded.get("mfa_pending"):
        return error("Sessão MFA inválida ou expirada.", status=401)

    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido.", status=400)

    code = data.get("code", "").strip()
    user_id = _get_user_id_from_claims(decoded)
    if user_id is None:
        return error("Sessão MFA inválida ou expirada.", status=401)

    if not code:
        return error("Código TOTP obrigatório.", status=400)

    ok, message = mfa_service.verify_mfa(user_id, code)
    if not ok:
        return error(message, status=401)

    user = auth_service.get_active_completed_user(user_id)
    if not user:
        return error("Utilizador inválido.", status=401)

    ip = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")
    refresh_token = session_service.create_session(user_id, ip, user_agent)

    response = build_auth_response(
        user=user,
        refresh_token=refresh_token,
        data={"user_id": user.user_id, "email": user.email, "role": user.role},
    )

    return clear_mfa_step_cookie(response)


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)

    if not refresh_token:
        return error("Refresh token ausente.", status=401)

    csrf_blocked = _validate_refresh_csrf(refresh_token)
    if csrf_blocked:
        return csrf_blocked

    ip = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")

    ok, result, user_id = session_service.rotate_session(refresh_token, ip, user_agent)

    if not ok:
        resp = make_response(error(result, status=401))
        return clear_auth_cookies(resp)

    user = auth_service.get_active_completed_user(user_id)
    if not user:
        resp = make_response(error("Utilizador inválido.", status=401))
        return clear_auth_cookies(resp)

    return build_auth_response(
        user=user,
        refresh_token=result,
        data={"user_id": user.user_id, "email": user.email, "role": user.role},
    )


@auth_bp.route("/logout", methods=["POST"])
def logout():
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)

    if refresh_token:
        csrf_blocked = _validate_refresh_csrf(refresh_token)
        if csrf_blocked:
            return csrf_blocked
        session_service.revoke_session(refresh_token)

    resp = make_response(success(message="Sessão encerrada."))

    clear_auth_cookies(resp)

    return clear_mfa_step_cookie(resp)


@auth_bp.route("/complete-registration", methods=["POST"])
def complete_registration():
    data = request.get_json(silent=True)

    if not data:
        return error("Body JSON inválido ou ausente.", status=400)

    token = data.get("token", "").strip()
    password = data.get("password", "")

    if not token:
        return error("Token de registo obrigatório.", status=400)

    if not password or len(password) < 8:
        return error("A password deve ter pelo menos 8 caracteres", status=400)

    ok, message, user = auth_service.complete_registration(token, password)

    if not ok:
        return error(message, status=400)

    if not user:
        return error("Utilizador inválido.", status=400)

    resp_body, status = success(
        data={
            "mfa_setup_required": True,
            "next": "mfa_enrollment",
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
        },
        message=message,
    )
    response = make_response(resp_body, status)

    clear_auth_cookies(response)
    set_mfa_step_cookie(
        response,
        user.user_id,
        {
            "mfa_enrollment": True,
            "registration_completed": True,
            "role": user.role,
        },
    )

    return response


@auth_bp.route("/me", methods=["GET"])
@authenticated_user_required
def me():
    user = g.current_user

    return success(
        data={
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
            "permissions": sorted(
                permission.value for permission in permissions_for_role(user.role)
            ),
        }
    )
