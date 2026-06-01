from flask import Blueprint, make_response, request

from app.services import admin_transfer_service
from app.utils.cookie_helpers import clear_auth_cookies
from app.utils.decorators import admin_required, get_current_user_id
from app.utils.responses import error, success

admin_transfer_bp = Blueprint(
    "admin_transfer",
    __name__,
    url_prefix="/api/admin-transfer",
)


@admin_transfer_bp.route("/pending", methods=["GET"])
@admin_required
def get_pending():
    return success(data=admin_transfer_service.get_pending_transfer())


@admin_transfer_bp.route("/eligible-managers", methods=["GET"])
@admin_required
def eligible_managers():
    users = admin_transfer_service.get_eligible_managers(get_current_user_id())
    return success(data=users)


@admin_transfer_bp.route("/existing", methods=["POST"])
@admin_required
def transfer_existing():
    data = request.get_json(silent=True) or {}

    target_user_id = data.get("target_user_id")
    action_token = data.get("action_token", "").strip()

    if not target_user_id:
        return error("target_user_id obrigatório.", status=400)

    try:
        target_user_id = int(target_user_id)
    except (TypeError, ValueError):
        return error("target_user_id inválido.", status=400)

    current_admin_id = get_current_user_id()
    ok, message = admin_transfer_service.validate_action_token(
        action_token, current_admin_id
    )
    if not ok:
        return error(message, status=401)

    ok, message = admin_transfer_service.transfer_to_existing_admin(
        current_admin_id=current_admin_id,
        target_user_id=target_user_id,
    )
    if not ok:
        return error(message, status=400)

    response = make_response(success(message=message))
    return clear_auth_cookies(response)


@admin_transfer_bp.route("/new", methods=["POST"])
@admin_required
def transfer_new():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    action_token = data.get("action_token", "").strip()

    if not email:
        return error("Email obrigatório.", status=400)

    current_admin_id = get_current_user_id()
    ok, message = admin_transfer_service.validate_action_token(
        action_token, current_admin_id
    )
    if not ok:
        return error(message, status=401)

    ok, message, pending = admin_transfer_service.start_transfer_to_new_admin(
        current_admin_id=current_admin_id,
        email=email,
    )
    if not ok:
        return error(message, status=400)

    return success(data=pending, message=message, status=201)


@admin_transfer_bp.route("/pending/resend", methods=["POST"])
@admin_required
def resend_pending():
    ok, message = admin_transfer_service.resend_pending_transfer_email(
        get_current_user_id()
    )
    if not ok:
        return error(message, status=400)

    return success(message=message)


@admin_transfer_bp.route("/pending/cancel", methods=["POST"])
@admin_required
def cancel_pending():
    ok, message = admin_transfer_service.cancel_pending_transfer(
        get_current_user_id()
    )
    if not ok:
        return error(message, status=400)

    return success(message=message)
