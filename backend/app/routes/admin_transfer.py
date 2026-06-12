from flask import Blueprint, make_response, request

from app.extensions import limiter
from app.security.permissions import Permission
from app.services import admin_transfer_service
from app.utils.cookie_helpers import clear_auth_cookies
from app.utils.decorators import get_current_user_id, permission_required
from app.utils.responses import error, success

admin_transfer_bp = Blueprint(
    "admin_transfer",
    __name__,
    url_prefix="/api/admin-transfer",
)


@admin_transfer_bp.route("/pending", methods=["GET"])
@permission_required(Permission.ADMIN_TRANSFER_READ)
def get_pending():
    return success(data=admin_transfer_service.get_pending_transfer())


@admin_transfer_bp.route("/eligible-managers", methods=["GET"])
@permission_required(Permission.ADMIN_TRANSFER_READ)
def eligible_managers():
    users = admin_transfer_service.get_eligible_managers(get_current_user_id())
    return success(data=users)


@admin_transfer_bp.route("/existing", methods=["POST"])
@permission_required(Permission.ADMIN_TRANSFER_START)
@limiter.limit("5 per minute")
def transfer_existing():
    data = request.get_json(silent=True) or {}

    target_user_id = data.get("target_user_id")
    password = data.get("password", "")
    totp_code = str(data.get("totp_code") or "").strip()

    if not target_user_id:
        return error("target_user_id obrigatório.", status=400)
    if not password:
        return error("Password obrigatória.", status=400)
    if not totp_code:
        return error("Código TOTP obrigatório.", status=400)
    if not totp_code.isdigit() or len(totp_code) != 6:
        return error("Código TOTP deve conter 6 dígitos.", status=400)

    try:
        target_user_id = int(target_user_id)
    except (TypeError, ValueError):
        return error("target_user_id inválido.", status=400)

    current_admin_id = get_current_user_id()
    ok, message = admin_transfer_service.transfer_to_existing_admin(
        current_admin_id=current_admin_id,
        target_user_id=target_user_id,
        password=password,
        totp_code=totp_code,
    )
    if not ok:
        return error(message, status=400)

    response = make_response(success(message=message))
    return clear_auth_cookies(response)


@admin_transfer_bp.route("/new", methods=["POST"])
@permission_required(Permission.ADMIN_TRANSFER_START)
@limiter.limit("5 per minute")
def transfer_new():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    totp_code = str(data.get("totp_code") or "").strip()

    if not email:
        return error("Email obrigatório.", status=400)
    if not password:
        return error("Password obrigatória.", status=400)
    if not totp_code:
        return error("Código TOTP obrigatório.", status=400)
    if not totp_code.isdigit() or len(totp_code) != 6:
        return error("Código TOTP deve conter 6 dígitos.", status=400)

    current_admin_id = get_current_user_id()
    ok, message, pending = admin_transfer_service.start_transfer_to_new_admin(
        current_admin_id=current_admin_id,
        email=email,
        password=password,
        totp_code=totp_code,
    )
    if not ok:
        return error(message, status=400)

    return success(data=pending, message=message, status=201)


@admin_transfer_bp.route("/pending/resend", methods=["POST"])
@permission_required(Permission.ADMIN_TRANSFER_RESEND)
def resend_pending():
    ok, message = admin_transfer_service.resend_pending_transfer_email(
        get_current_user_id()
    )
    if not ok:
        return error(message, status=400)

    return success(message=message)


@admin_transfer_bp.route("/pending/cancel", methods=["POST"])
@permission_required(Permission.ADMIN_TRANSFER_CANCEL)
def cancel_pending():
    ok, message = admin_transfer_service.cancel_pending_transfer(
        get_current_user_id()
    )
    if not ok:
        return error(message, status=400)

    return success(message=message)
