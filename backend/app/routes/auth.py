from flask import Blueprint, request
from flask_jwt_extended import create_access_token
from app.services import auth_service
from app.utils.responses import success, error
from app.extensions import limiter

# Cria o blueprint com o nome 'auth' e prefixo de URL '/api/auth'
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


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

    token = create_access_token(
        identity=str(user.user_id),
        additional_claims={
            "role": user.role,
            "email": user.email,
        },
    )

    return success(
        data={
            "token": token,
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
        }
    )


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
    
    ok, message = auth_service.complete_registration(token, password)

    if not ok:
        return error(message, status=400)
    
    return success(message=message)
