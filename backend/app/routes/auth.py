import io
import base64
import hmac
import secrets
import time
import qrcode

from flask import Blueprint, current_app, g, make_response, request
from flask_jwt_extended import get_jwt

from app.services import (
    auth_service,
    mfa_enrollment_service,
    mfa_reconfiguration_service,
    mfa_recovery_service,
    mfa_service,
    password_change_service,
    password_reset_service,
    session_service,
)
from app.utils.cookie_helpers import (
    build_auth_response,
    clear_auth_cookies,
    set_mfa_step_cookie,
    get_mfa_step_claims,
    clear_mfa_step_cookie,
    set_mfa_reconfiguration_step_cookie,
    get_mfa_reconfiguration_step_claims,
    clear_mfa_reconfiguration_step_cookie,
    build_refresh_csrf_token,
    set_password_change_step_cookie,
    get_password_change_step_claims,
    clear_password_change_step_cookie,
)
from app.utils.responses import success, error
from app.extensions import limiter
from app.constants import (
    CSRF_HEADER_NAME,
    LOGIN_RATE_LIMIT,
    MFA_RECOVERY_RATE_LIMIT,
    MFA_RECONFIGURATION_RATE_LIMIT,
    PASSWORD_CHANGE_RATE_LIMIT,
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


def _get_int_claim(claims: dict, claim_name: str) -> int | None:
    try:
        return int(claims[claim_name])
    except (KeyError, TypeError, ValueError):
        return None


def _qr_code_data_uri(value: str) -> str:
    image = qrcode.make(value)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


def _prevent_sensitive_response_caching(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return response


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


@auth_bp.route("/password-change/confirm", methods=["POST"])
@limiter.limit(PASSWORD_CHANGE_RATE_LIMIT)
@authenticated_user_required
def confirm_password_change():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    if not isinstance(current_password, str):
        current_password = ""
    totp_code = str(data.get("totp_code", "")).strip()

    ok, message, fingerprint = password_change_service.confirm_identity(
        g.current_user.user_id,
        current_password,
        totp_code,
    )
    if not ok or not fingerprint:
        return error(message, status=400)

    response = make_response(success(message=message))
    return set_password_change_step_cookie(
        response,
        g.current_user.user_id,
        fingerprint,
        get_jwt()["jti"],
    )


@auth_bp.route("/password-change/complete", methods=["POST"])
@limiter.limit(PASSWORD_CHANGE_RATE_LIMIT)
@authenticated_user_required
def complete_password_change():
    claims = get_password_change_step_claims()
    step_user_id = _get_user_id_from_claims(claims or {})
    fingerprint = (claims or {}).get("password_fingerprint")
    step_access_jti = (claims or {}).get("access_jti")
    current_access_jti = get_jwt().get("jti")

    if (
        step_user_id != g.current_user.user_id
        or not isinstance(fingerprint, str)
        or not fingerprint
        or not isinstance(step_access_jti, str)
        or not isinstance(current_access_jti, str)
        or not hmac.compare_digest(step_access_jti, current_access_jti)
    ):
        response = make_response(
            error(password_change_service.INVALID_STEP_MESSAGE, status=400)
        )
        return clear_password_change_step_cookie(response)

    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password", "")
    if not isinstance(new_password, str):
        new_password = ""

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            g.current_user.user_id,
            new_password,
            fingerprint,
        )
    )
    if not ok:
        response = make_response(error(message, status=400))
        if not confirmation_valid:
            clear_password_change_step_cookie(response)
        return response

    response = make_response(success(message=message))
    clear_auth_cookies(response)
    clear_mfa_step_cookie(response)
    return clear_password_change_step_cookie(response)


@auth_bp.route("/mfa-reconfiguration/start", methods=["POST"])
@limiter.limit(MFA_RECONFIGURATION_RATE_LIMIT)
@authenticated_user_required
def start_mfa_reconfiguration():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    if not isinstance(current_password, str):
        current_password = ""
    current_totp_code = str(data.get("totp_code", "")).strip()

    ok, message, setup = mfa_reconfiguration_service.start_reconfiguration(
        g.current_user.user_id,
        current_password,
        current_totp_code,
    )
    if not ok or setup is None:
        return error(message, status=400)

    response = make_response(
        success(
            data={"qr_code": _qr_code_data_uri(setup.otp_uri)},
            message=message,
        )
    )
    _prevent_sensitive_response_caching(response)
    return set_mfa_reconfiguration_step_cookie(
        response,
        g.current_user.user_id,
        setup.reconfiguration_id,
        setup.password_fingerprint,
        setup.totp_fingerprint,
        get_jwt()["jti"],
    )


@auth_bp.route("/mfa-reconfiguration/complete", methods=["POST"])
@limiter.limit(MFA_RECONFIGURATION_RATE_LIMIT)
@authenticated_user_required
def complete_mfa_reconfiguration():
    claims = get_mfa_reconfiguration_step_claims() or {}
    step_user_id = _get_user_id_from_claims(claims)
    reconfiguration_id = _get_int_claim(claims, "reconfiguration_id")
    password_fingerprint = claims.get("password_fingerprint")
    totp_fingerprint = claims.get("totp_fingerprint")
    step_access_jti = claims.get("access_jti")
    current_access_jti = get_jwt().get("jti")

    if (
        step_user_id != g.current_user.user_id
        or reconfiguration_id is None
        or not isinstance(password_fingerprint, str)
        or not isinstance(totp_fingerprint, str)
        or not isinstance(step_access_jti, str)
        or not isinstance(current_access_jti, str)
        or not hmac.compare_digest(step_access_jti, current_access_jti)
    ):
        response = make_response(
            error(mfa_reconfiguration_service.INVALID_STEP_MESSAGE, status=400)
        )
        return clear_mfa_reconfiguration_step_cookie(response)

    data = request.get_json(silent=True) or {}
    new_totp_code = str(data.get("totp_code", "")).strip()
    ok, message, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            g.current_user.user_id,
            reconfiguration_id,
            new_totp_code,
            password_fingerprint,
            totp_fingerprint,
        )
    )
    if not ok:
        response = make_response(error(message, status=400))
        if not step_valid:
            clear_mfa_reconfiguration_step_cookie(response)
        return response

    response = make_response(
        success(
            data={"recovery_code": recovery_code},
            message=message,
        )
    )
    _prevent_sensitive_response_caching(response)
    clear_auth_cookies(response)
    clear_mfa_step_cookie(response)
    return clear_mfa_reconfiguration_step_cookie(response)


@auth_bp.route("/mfa-reconfiguration/cancel", methods=["POST"])
@limiter.limit(MFA_RECONFIGURATION_RATE_LIMIT)
@authenticated_user_required
def cancel_mfa_reconfiguration():
    ok, message = mfa_reconfiguration_service.cancel_reconfiguration(
        g.current_user.user_id
    )
    response = make_response(
        success(message=message) if ok else error(message, status=400)
    )
    return clear_mfa_reconfiguration_step_cookie(response)


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

    return success(data={"qr_code": _qr_code_data_uri(otp_uri)})


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

    ok, message, recovery_code = mfa_enrollment_service.confirm_enrollment(
        user_id,
        code,
    )
    if not ok:
        return error(message, status=400)

    return success(
        data={"recovery_code": recovery_code},
        message=message,
    )


@auth_bp.route("/enroll-mfa/complete", methods=["POST"])
@limiter.limit("5 per minute")
def enroll_mfa_complete():
    decoded = get_mfa_step_claims()
    if not decoded or not decoded.get("mfa_enrollment"):
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    user_id = _get_user_id_from_claims(decoded)
    if user_id is None:
        return error("Sessão de configuração MFA inválida ou expirada.", status=401)

    user = mfa_service.get_enrollment_user_for_session(user_id)
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


@auth_bp.route("/recover-mfa", methods=["POST"])
@limiter.limit(MFA_RECOVERY_RATE_LIMIT)
def recover_mfa():
    decoded = get_mfa_step_claims()
    if not decoded or not decoded.get("mfa_pending"):
        return error("Sessão MFA inválida ou expirada.", status=401)

    user_id = _get_user_id_from_claims(decoded)
    if user_id is None:
        return error("Sessão MFA inválida ou expirada.", status=401)

    data = request.get_json(silent=True)
    recovery_code = (data or {}).get("recovery_code", "").strip()
    if not recovery_code:
        return error("Código de recuperação obrigatório.", status=400)

    ok, message = mfa_recovery_service.recover_authenticator(
        user_id,
        recovery_code,
    )
    if not ok:
        return error(message, status=400)

    response = make_response(success(message=message))
    clear_auth_cookies(response)
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

    ok, message, user = mfa_service.verify_mfa(user_id, code)
    if not ok:
        return error(message, status=401)

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
