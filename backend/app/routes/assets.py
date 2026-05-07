from flask import Blueprint, jsonify

assets_bp = Blueprint("assets", __name__, url_prefix="/api/assets")


@assets_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "assets blueprint ok"}), 200