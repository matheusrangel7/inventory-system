from flask import Blueprint, jsonify
from app.services import location_service
from app.utils.responses import success
from app.utils.decorators import admin_required
from app.models.location import Location

locations_bp = Blueprint("locations", __name__, url_prefix="/api/locations")

def _location_to_dict(location: Location) -> dict:
    return {
        "location_id": location.location_id,
        "location_name": location.location_name
    }


@locations_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "locations blueprint ok"}), 200

@locations_bp.route("/available", methods=["GET"])
@admin_required
def list_available_locations():
    locations = location_service.get_available_locations()
    return success(data=[_location_to_dict(loc) for loc in locations])