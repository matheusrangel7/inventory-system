from flask import Blueprint, request

from app.services import user_service
from app.utils.decorators import admin_required, get_current_user_id
from app.utils.responses import error, success

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _user_to_dict(user) -> dict:
    return user_service.user_to_dict(user)


@users_bp.route("/", methods=["GET"])
@admin_required
def list_users():
    users = user_service.get_all_users()
    return success(data=[_user_to_dict(user) for user in users])


@users_bp.route("/pending", methods=["GET"])
@admin_required
def list_pending():
    users = user_service.get_pending_users()
    return success(data=[_user_to_dict(user) for user in users])


@users_bp.route("/", methods=["POST"])
@admin_required
def create_user():
    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido ou ausente.", status=400)

    email = data.get("email", "").strip().lower()
    role = data.get("role") or "Gestor"
    location_ids = data.get("location_ids", [])

    admin_id = get_current_user_id()
    ok, message, user = user_service.create_user(email, role, location_ids, admin_id)
    if not ok:
        return error(message, status=409)

    return success(data=_user_to_dict(user), message=message, status=201)


@users_bp.route("/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id: int):
    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido ou ausente.", status=400)

    email = data.get("email", "").strip().lower()
    role = data.get("role") or "Gestor"
    location_ids = data.get("location_ids", [])

    ok, message, user = user_service.update_user(
        user_id=user_id,
        email=email,
        role=role,
        location_ids=location_ids,
        admin_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)

    return success(data=_user_to_dict(user), message=message)


@users_bp.route("/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id: int):
    ok, message, user = user_service.delete_user(
        user_id=user_id,
        admin_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)

    return success(data=_user_to_dict(user), message=message)
