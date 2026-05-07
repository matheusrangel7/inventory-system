from flask import Blueprint, jsonify

locations_bp = Blueprint("locations", __name__, url_prefix="/api/locations")


@locations_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "locations blueprint ok"}), 200