import io
import base64
import qrcode
from datetime import timedelta

from flask import Blueprint, request, make_response
from flask_jwt_extended import (
    jwt_required,
    get_jwt,
    get_jwt_identity,
    create_access_token,
)

from app.services import (
    auth_service,
    mfa_service,
    session_service,
    admin_transfer_service,
)
from app.utils.cookie_helpers import (
    build_auth_response,
    clear_auth_cookies,
    set_mfa_step_cookie,
    get_mfa_step_claims,
    clear_mfa_step_cookie,
)
from app.utils.responses import success, error
from app.extensions import db, limiter
from app.utils.decorators import admin_required, get_current_user_id
from app.constants import ADMIN_ACTION_TOKEN_MINUTES, MAX_LOGIN_ATTEMPTS

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _get_user_id_from_claims(claims: dict) -> int | None:
    try:
        return int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def _get_user_id_from_identity() -> int | None:
    try:
        return int(get_jwt_identity())
    except (TypeError, ValueError):
        return None


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(f"{MAX_LOGIN_ATTEMPTS} per minute")
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
@limiter.limit(f"{MAX_LOGIN_ATTEMPTS} per minute")
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
@limiter.limit(f"{MAX_LOGIN_ATTEMPTS} per minute")
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

    has_pending_transfer = admin_transfer_service.has_pending_for_target(user_id)

    ok, message = mfa_service.confirm_mfa_setup(
        user_id,
        code,
        commit=not has_pending_transfer,
    )
    if not ok:
        return error(message, status=400)

    if has_pending_transfer and not admin_transfer_service.complete_pending_after_mfa(
        user_id
    ):
        db.session.rollback()
        return error(
            "Não foi possível concluir a transferência de administração.",
            status=400,
        )

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
@limiter.limit(f"{MAX_LOGIN_ATTEMPTS} per minute")
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
    refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        return error("Refresh token ausente.", status=401)

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
    refresh_token = request.cookies.get("refresh_token")

    if refresh_token:
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


@auth_bp.route("/verify-password", methods=["POST"])
@admin_required
def verify_password():
    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido.", status=400)

    password = data.get("password", "")
    if not password:
        return error("Password obrigatória.", status=400)

    user_id = get_current_user_id()
    ok, message = auth_service.verify_password(user_id, password)
    if not ok:
        return error(message, status=401)

    action_token = create_access_token(
        identity=str(user_id),
        additional_claims={
            "action": "transfer_admin",
            "authorized": True,
        },
        expires_delta=timedelta(minutes=ADMIN_ACTION_TOKEN_MINUTES),
    )

    return success(data={"action_token": action_token})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    claims = get_jwt()
    if claims.get("mfa_pending") or claims.get("mfa_enrollment"):
        return error("Sessão incompleta.", status=403)

    user_id = _get_user_id_from_identity()
    if user_id is None:
        return error("Utilizador inválido.", status=401)

    user = auth_service.get_active_completed_user(user_id)
    if not user:
        return error("Utilizador inválido.", status=401)

    return success(
        data={
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
        }
    )
