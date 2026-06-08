from functools import wraps

from flask import g, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.domain.enums import RegistrationStatus
from app.extensions import db
from app.models.user import User
from app.security.permissions import Permission, has_permission


def _get_identity_user_id() -> int | None:
    try:
        return int(get_jwt_identity())
    except (TypeError, ValueError):
        return None


def _load_current_user():
    verify_jwt_in_request()

    claims = get_jwt()
    if claims.get("token_use") != "access":
        return None, jsonify({"success": False, "error": "Token inválido."}), 401

    if claims.get("mfa_pending") or claims.get("mfa_enrollment"):
        return None, jsonify({"success": False, "error": "Sessão incompleta."}), 403

    user_id = _get_identity_user_id()
    if user_id is None:
        return None, jsonify({"success": False, "error": "Utilizador inválido."}), 401

    user = db.session.get(User, user_id)

    if not user or not user.is_active:
        return None, jsonify({"success": False, "error": "Utilizador inválido."}), 401

    if user.registration_status != RegistrationStatus.COMPLETED:
        return None, jsonify({"success": False, "error": "Registo incompleto."}), 403

    g.current_user = user
    return user, None, None


def authenticated_user_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        _, response, status = _load_current_user()
        if response:
            return response, status

        return fn(*args, **kwargs)

    return wrapper


def permission_required(permission: Permission):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user, response, status = _load_current_user()
            if response:
                return response, status

            if not has_permission(user.role, permission):
                return (
                    jsonify({"success": False, "error": "Acesso não autorizado."}),
                    403,
                )

            return fn(*args, **kwargs)

        wrapper.required_permission = permission
        return wrapper

    return decorator


def get_current_user_id() -> int:
    if hasattr(g, "current_user"):
        return g.current_user.user_id
    user_id = _get_identity_user_id()
    if user_id is None:
        raise ValueError("JWT identity inválida.")
    return user_id


def get_current_role() -> str | None:
    if hasattr(g, "current_user"):
        return g.current_user.role

    user_id = _get_identity_user_id()
    if user_id is None:
        return None

    user = db.session.get(User, user_id)
    return user.role if user else None
