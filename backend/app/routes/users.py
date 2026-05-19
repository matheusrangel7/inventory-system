# backend/app/routes/users.py
from flask import Blueprint, request
from app.services import user_service
from app.utils.responses import success, error
from app.utils.decorators import admin_required, get_current_user_id

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _user_to_dict(user) -> dict:
    """Serializa User → dict para resposta JSON."""
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "registration_status": user.registration_status,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@users_bp.route("/", methods=["GET"])
@admin_required
def list_users():
    users = user_service.get_all_users()
    return success(data=[_user_to_dict(u) for u in users])


@users_bp.route("/pending", methods=["GET"])
@admin_required
def list_pending():
    users = user_service.get_pending_users()
    return success(data=[_user_to_dict(u) for u in users])


@users_bp.route("/", methods=["POST"])
@admin_required
def create_user():
    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON inválido ou ausente.", status=400)

    email = data.get("email", "").strip().lower()
    location_ids = data.get("location_ids", [])

    if not email:
        return error("Email é obrigatório.", status=400)

    if not isinstance(location_ids, list) or len(location_ids) == 0:
        return error("É necessário atribuir pelo menos uma sala.", status=400)

    admin_id = get_current_user_id()
    ok, message, user = user_service.create_gestor(email, location_ids, admin_id)

    if not ok:
        return error(message, status=409)

    return success(
        data=_user_to_dict(user),
        message=message,
        status=201,
    )
