from flask import Blueprint, jsonify

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "users blueprint ok"}), 200