import io
import base64
import hmac
import qrcode

from flask import Blueprint, request, make_response, current_app
from flask_jwt_extended import (
    jwt_required,
    get_jwt,
    get_jwt_identity,
)

from app.services import auth_service, mfa_service, session_service
from app.utils.cookie_helpers import (
    build_auth_response,
    clear_auth_cookies,
    set_mfa_step_cookie,
    get_mfa_step_claims,
    clear_mfa_step_cookie,
    build_refresh_csrf_token,
)
from app.utils.responses import success, error
from app.models.user import User
from app.extensions import db
from app.extensions import limiter
from app.constants import (
    CSRF_HEADER_NAME,
    REFRESH_CSRF_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
)

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


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
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

    user_id = int(decoded["sub"])
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
    user_id = int(decoded["sub"])

    if not code:
        return error("Código TOTP obrigatório.", status=400)

    ok, message = mfa_service.confirm_mfa_setup(user_id, code)
    if not ok:
        return error(message, status=400)

    user = db.session.get(User, user_id)
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
    user_id = int(decoded["sub"])

    if not code:
        return error("Código TOTP obrigatório.", status=400)

    ok, message = mfa_service.verify_mfa(user_id, code)
    if not ok:
        return error(message, status=401)

    user = db.session.get(User, user_id)

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

    user = db.session.get(User, user_id)

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
@jwt_required()
def me():
    claims = get_jwt()
    if claims.get("mfa_pending") or claims.get("mfa_enrollment"):
        return error("Sessão incompleta.", status=403)

    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        return error("Utilizador inválido.", status=401)

    return success(
        data={
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        }
    )
