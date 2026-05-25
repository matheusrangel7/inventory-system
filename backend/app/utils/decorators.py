from functools import wraps
from flask import jsonify
from flask_jwt_extended import (
    verify_jwt_in_request,
    get_jwt,
    get_jwt_identity,
)


def admin_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        verify_jwt_in_request()
        
        blocked = _ensure_full_session()
        if blocked:
            return blocked
        
        claims = get_jwt()

        if claims.get("role") != "Administrador":
            return (
                jsonify(
                    {"success": False, "error": "Acesso restrito a administradores."}
                ),
                403,
            )

        return fn(*args, **kwargs)

    return wrapper


def manager_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        verify_jwt_in_request()

        blocked = _ensure_full_session()
        if blocked:
            return blocked
        
        claims = get_jwt()

        if claims.get("role") not in ("Gestor", "Administrador"):
            return jsonify({"success": False, "error": "Acesso não autorizado."}), 403

        return fn(*args, **kwargs)

    return wrapper


def get_current_user_id() -> int:
    return int(get_jwt_identity())

def get_current_role() -> str:
    return get_jwt().get("role")

def _ensure_full_session():
    claims = get_jwt()
    
    if claims.get("mfa_pending") or claims.get("mfa_enrollment"):
        return jsonify({"success": False, "error": "Sessão incompleta."}), 403
    
    return None


