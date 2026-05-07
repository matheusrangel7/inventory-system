from flask import Blueprint, jsonify

# Cria o blueprint com o nome 'auth' e prefixo de URL '/api/auth'
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/ping", methods=["GET"])
def ping():
    """Rota de teste para verificar que o blueprint está registado."""
    return jsonify({"message": "auth blueprint ok"}), 200

# As rotas reais (login, register) serão implementadas no Sprint 1