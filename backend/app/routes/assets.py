import json

from flask import Blueprint, jsonify, request

from app.services import inventory_service
from app.utils.decorators import get_current_role, get_current_user_id, manager_required
from app.utils.responses import error, success

assets_bp = Blueprint("assets", __name__, url_prefix="/api/assets")


def parse_optional_int(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_spec_filters(args):
    raw_filters = args.get("spec_filters")
    if raw_filters:
        try:
            parsed = json.loads(raw_filters)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except (TypeError, ValueError, json.JSONDecodeError):
            return []

    feature_id = args.get("spec_feature_id") or args.get("feature_id")
    feature_name = args.get("spec_feature") or args.get("feature_name")
    spec_value = args.get("spec_value") or args.get("value")
    operator = args.get("spec_operator") or args.get("operator") or "contains"

    if feature_id or feature_name:
        return [{
            "feature_id": feature_id,
            "feature_name": feature_name,
            "operator": operator,
            "value": spec_value,
        }]
    return []


def effective_manager_id():
    role = get_current_role()
    if role == "Gestor":
        return get_current_user_id()
    manager_id = parse_optional_int(request.args.get("manager_id"))
    if manager_id is None and "user_id" in request.args:
        manager_id = parse_optional_int(request.args.get("user_id"))
    return manager_id


@assets_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "assets blueprint ok"}), 200


@assets_bp.route("/categories", methods=["GET"])
@manager_required
def list_categories_alias():
    include_features = request.args.get("include_features", "false").lower() in {"1", "true", "yes", "sim"}
    categories = inventory_service.get_all_categories(include_features=include_features)
    if include_features:
        return success(data=categories)
    return success(data=[inventory_service.category_to_dict(category) for category in categories])


@assets_bp.route("/features", methods=["GET"])
@manager_required
def list_features():
    category_id = request.args.get("category_id", type=int)
    if not category_id:
        return error("category_id é obrigatório.", status=400)
    features = inventory_service.get_features_by_category(category_id)
    return success(data=[inventory_service.feature_to_dict(feature) for feature in features])


@assets_bp.route("/categories/<int:category_id>/features", methods=["GET"])
@manager_required
def list_features_for_category_alias(category_id: int):
    features = inventory_service.get_features_by_category(category_id)
    return success(data=[inventory_service.feature_to_dict(feature) for feature in features])


@assets_bp.route("/", methods=["GET"])
@manager_required
def search_assets():
    result = inventory_service.get_assets_by_filters(
        location_id=request.args.get("location_id", type=int),
        category_id=request.args.get("category_id", type=int),
        asset_state=request.args.get("asset_state") or request.args.get("status"),
        assigned=request.args.get("assigned"),
        manager_id=effective_manager_id(),
        search=request.args.get("search") or request.args.get("q"),
        category_name=request.args.get("category_name") or request.args.get("category"),
        location_name=request.args.get("location_name") or request.args.get("location"),
        spec_filters=parse_spec_filters(request.args),
        sort=request.args.get("sort"),
        page=request.args.get("page", type=int),
        page_size=request.args.get("page_size", type=int),
    )
    return success(data=result)


@assets_bp.route("/", methods=["POST"])
@manager_required
def add_asset():
    data = request.get_json(silent=True) or {}

    serial_number = (data.get("serial_number") or "").strip()
    category_id = data.get("category_id")
    location_id = data.get("location_id")
    asset_state = (data.get("asset_state") or data.get("status") or "Bom Estado").strip()
    assigned_to = data.get("assigned_to")
    maintenance_period_months = data.get("maintenance_period_months")
    last_maintenance = data.get("last_maintenance") or None
    specs = data.get("specs") or {}

    if not serial_number or not category_id or not location_id:
        return error("Campos obrigatórios em falta.", status=400)

    try:
        maintenance_period_months = int(maintenance_period_months) if maintenance_period_months else None
    except (TypeError, ValueError):
        return error("Período de manutenção inválido.", status=400)

    ok, message, asset = inventory_service.create_asset(
        serial_number=serial_number,
        category_id=int(category_id),
        location_id=int(location_id),
        state=asset_state,
        specs=specs,
        admin_id=get_current_user_id(),
        role=get_current_role(),
        assigned_to=assigned_to,
        maintenance_period_months=maintenance_period_months,
        last_maintenance=last_maintenance,
    )
    if not ok:
        return error(message, status=400)
    return success(data=asset, message=message, status=201)


@assets_bp.route("/<int:asset_id>", methods=["GET"])
@manager_required
def get_asset(asset_id: int):
    manager_id = get_current_user_id() if get_current_role() == "Gestor" else None
    asset = inventory_service.get_asset_by_id(asset_id, manager_id=manager_id)
    if not asset:
        return error("Ativo não encontrado.", status=404)
    return success(data=asset)


@assets_bp.route("/<int:asset_id>", methods=["PUT"])
@manager_required
def update_asset(asset_id: int):
    data = request.get_json(silent=True) or {}

    serial_number = (data.get("serial_number") or "").strip()
    category_id = data.get("category_id")
    location_id = data.get("location_id")
    asset_state = (data.get("asset_state") or data.get("status") or "Bom Estado").strip()
    assigned_to = data.get("assigned_to")
    maintenance_period_months = data.get("maintenance_period_months")
    last_maintenance = data.get("last_maintenance") or None
    specs = data.get("specs") or {}

    if not serial_number or not category_id or not location_id:
        return error("Campos obrigatórios em falta.", status=400)

    try:
        maintenance_period_months = int(maintenance_period_months) if maintenance_period_months else None
    except (TypeError, ValueError):
        return error("Período de manutenção inválido.", status=400)

    ok, message, asset = inventory_service.update_asset(
        asset_id=asset_id,
        serial_number=serial_number,
        category_id=int(category_id),
        location_id=int(location_id),
        state=asset_state,
        specs=specs,
        admin_id=get_current_user_id(),
        role=get_current_role(),
        assigned_to=assigned_to,
        maintenance_period_months=maintenance_period_months,
        last_maintenance=last_maintenance,
    )
    if not ok:
        return error(message, status=400)
    return success(data=asset, message=message)


@assets_bp.route("/<int:asset_id>", methods=["DELETE"])
@manager_required
def delete_asset(asset_id: int):
    ok, message, asset = inventory_service.delete_asset(
        asset_id=asset_id,
        admin_id=get_current_user_id(),
        role=get_current_role(),
    )
    if not ok:
        return error(message, status=404)
    return success(data=asset, message=message)
