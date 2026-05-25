from flask import Blueprint, jsonify, request

from app.services import location_service
from app.utils.decorators import admin_required, get_current_role, get_current_user_id, manager_required
from app.utils.responses import error, success

locations_bp = Blueprint("locations", __name__, url_prefix="/api/locations")

def _location_to_dict(location: Location) -> dict:
    return {
        "location_id": location.location_id,
        "location_name": location.location_name
    }


def parse_optional_int(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def effective_manager_id():
    if get_current_role() == "Gestor":
        return get_current_user_id()
    manager_id = parse_optional_int(request.args.get("manager_id"))
    if manager_id is None and "user_id" in request.args:
        manager_id = parse_optional_int(request.args.get("user_id"))
    return manager_id


@locations_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "locations blueprint ok"}), 200


@locations_bp.route("/", methods=["GET"])
@manager_required
def list_locations():
    return success(data=location_service.get_all_locations(manager_id=effective_manager_id()))


@locations_bp.route("/<int:location_id>", methods=["GET"])
@manager_required
def get_location(location_id: int):
    manager_id = get_current_user_id() if get_current_role() == "Gestor" else None
    location = location_service.get_location_by_id(location_id, manager_id=manager_id)
    if not location:
        return error("Local não encontrado.", status=404)
    return success(data=location)


@locations_bp.route("/", methods=["POST"])
@admin_required
def create_location():
    data = request.get_json(silent=True) or {}
    location_name = data.get("location_name") or data.get("name") or data.get("designacao")
    manager_id = data.get("location_manager_id") or data.get("manager_id")

    ok, message, location = location_service.create_location(
        location_name=location_name,
        manager_id=manager_id,
        user_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=409)
    return success(data=location, message=message, status=201)


@locations_bp.route("/<int:location_id>", methods=["PUT"])
@admin_required
def update_location(location_id: int):
    data = request.get_json(silent=True) or {}
    location_name = data.get("location_name") or data.get("name") or data.get("designacao")
    manager_id = data.get("location_manager_id") or data.get("manager_id")

    ok, message, location = location_service.update_location(
        location_id=location_id,
        location_name=location_name,
        manager_id=manager_id,
        user_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)
    return success(data=location, message=message)


@locations_bp.route("/<int:location_id>", methods=["DELETE"])
@admin_required
def delete_location(location_id: int):
    ok, message, location = location_service.delete_location(
        location_id=location_id,
        user_id=get_current_user_id(),
    )
    if not ok:
        return error(message, status=400)
    return success(data=location, message=message)
