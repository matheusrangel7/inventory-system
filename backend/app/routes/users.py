from flask import Blueprint, request

from app.constants import ADMIN_ACCOUNT_RECOVERY_RATE_LIMIT
from app.extensions import limiter
from app.security.permissions import Permission
from app.services import admin_account_recovery_service, user_service
from app.utils.decorators import get_current_user_id, permission_required
from app.utils.responses import error, success

users_bp = Blueprint("users", __name__, url_prefix="/api/users")
access_recovery_limit = limiter.shared_limit(
    ADMIN_ACCOUNT_RECOVERY_RATE_LIMIT,
    scope="admin-account-recovery",
)


@users_bp.route("/", methods=["GET"])
@permission_required(Permission.USERS_READ)
def list_users():
    return success(data=user_service.get_all_gestores())


@users_bp.route("/pending", methods=["GET"])
@permission_required(Permission.USERS_READ)
def list_pending():
    return success(data=user_service.get_pending_gestores())


@users_bp.route("/", methods=["POST"])
@permission_required(Permission.USERS_INVITE)
def create_user():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return error("Body JSON inválido ou ausente.", status=400)

    if "role" in data:
        return error("O campo role não pode ser definido por esta rota.", status=400)

    email = data.get("email", "").strip().lower()
    location_ids = data.get("location_ids", [])

    admin_id = get_current_user_id()
    ok, message, user, status = user_service.create_gestor(
        email, location_ids, admin_id
    )
    if not ok:
        return error(message, status=status)

    return success(data=user_service.user_to_dict(user), message=message, status=201)


@users_bp.route("/<int:user_id>", methods=["PUT"])
@permission_required(Permission.USERS_UPDATE)
def update_user(user_id: int):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return error("Body JSON inválido ou ausente.", status=400)

    if "role" in data:
        return error("O campo role não pode ser alterado por esta rota.", status=400)

    email = data.get("email", "").strip().lower()
    location_ids = data.get("location_ids", [])

    ok, message, user = user_service.update_user(
        user_id=user_id,
        email=email,
        location_ids=location_ids,
        admin_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)

    return success(data=user_service.user_to_dict(user), message=message)


@users_bp.route("/<int:user_id>", methods=["DELETE"])
@permission_required(Permission.USERS_DEACTIVATE)
def delete_user(user_id: int):
    ok, message, user = user_service.delete_user(
        user_id=user_id,
        admin_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)

    return success(data=user_service.user_to_dict(user), message=message)


@users_bp.route("/<int:target_id>/resend-registration", methods=["POST"])
@permission_required(Permission.USERS_RESEND_REGISTRATION)
def resend_registration(target_id: int):
    ok, message = user_service.resend_registration_email(target_id)
    if not ok:
        return error(message, status=400)

    return success(message=message)


def _recovery_credentials(data: dict) -> tuple[str, str]:
    password = data.get("password", "")
    totp_code = str(data.get("totp_code") or "").strip()
    return password, totp_code


@users_bp.route(
    "/<int:target_id>/access-recovery/email",
    methods=["POST"],
)
@permission_required(Permission.USERS_RECOVER_ACCESS)
@access_recovery_limit
def recover_access_email(target_id: int):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Body JSON inválido ou ausente.", status=400)

    password, totp_code = _recovery_credentials(data)
    ok, message, user, status = admin_account_recovery_service.change_email(
        administrator_id=get_current_user_id(),
        target_user_id=target_id,
        new_email=data.get("new_email", ""),
        password=password,
        totp_code=totp_code,
    )
    if not ok:
        return error(message, status=status)

    return success(
        data=user_service.user_to_dict(user),
        message=message,
    )


@users_bp.route(
    "/<int:target_id>/access-recovery/password-reset",
    methods=["POST"],
)
@permission_required(Permission.USERS_RECOVER_ACCESS)
@access_recovery_limit
def recover_access_password(target_id: int):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Body JSON inválido ou ausente.", status=400)

    password, totp_code = _recovery_credentials(data)
    ok, message, user, status = (
        admin_account_recovery_service.request_password_reset(
            administrator_id=get_current_user_id(),
            target_user_id=target_id,
            password=password,
            totp_code=totp_code,
        )
    )
    if not ok:
        return error(message, status=status)

    return success(
        data=user_service.user_to_dict(user),
        message=message,
    )


@users_bp.route(
    "/<int:target_id>/access-recovery/mfa-reset",
    methods=["POST"],
)
@permission_required(Permission.USERS_RECOVER_ACCESS)
@access_recovery_limit
def recover_access_mfa(target_id: int):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Body JSON inválido ou ausente.", status=400)

    password, totp_code = _recovery_credentials(data)
    ok, message, user, status = admin_account_recovery_service.reset_mfa(
        administrator_id=get_current_user_id(),
        target_user_id=target_id,
        password=password,
        totp_code=totp_code,
    )
    if not ok:
        return error(message, status=status)

    return success(
        data=user_service.user_to_dict(user),
        message=message,
    )
