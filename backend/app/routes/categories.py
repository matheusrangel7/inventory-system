from flask import Blueprint, request

from app.security.permissions import Permission
from app.services import inventory_service
from app.utils.decorators import get_current_user_id, permission_required
from app.utils.responses import error, success

categories_bp = Blueprint("categories", __name__, url_prefix="/api/categories")


def include_features_requested() -> bool:
    return request.args.get("include_features", "false").lower() in {"1", "true", "yes", "sim"}


@categories_bp.route("/", methods=["GET"])
@permission_required(Permission.CATEGORIES_READ)
def list_categories():
    include_features = include_features_requested()
    categories = inventory_service.get_all_categories(include_features=include_features)
    if include_features:
        return success(data=categories)
    return success(data=[inventory_service.category_to_dict(category) for category in categories])


@categories_bp.route("/", methods=["POST"])
@permission_required(Permission.CATEGORIES_CREATE)
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("category_name") or data.get("name") or "").strip()
    features = data.get("features") or []

    if not name:
        return error("O nome da categoria é obrigatório.", status=400)
    if not isinstance(features, list):
        return error("O campo features deve ser uma lista.", status=400)

    ok, message, category = inventory_service.create_category_with_features(name, features, get_current_user_id())
    if not ok:
        return error(message, status=409)
    return success(data=inventory_service.category_to_dict(category, include_features=True), message=message, status=201)


@categories_bp.route("/<int:category_id>", methods=["GET"])
@permission_required(Permission.CATEGORIES_READ)
def get_category(category_id: int):
    category = inventory_service.get_category_by_id(category_id)
    if not category:
        return error("Categoria não encontrada.", status=404)
    return success(data=inventory_service.category_to_dict(category, include_features=True))


@categories_bp.route("/<int:category_id>", methods=["PUT"])
@permission_required(Permission.CATEGORIES_UPDATE)
def update_category(category_id: int):
    data = request.get_json(silent=True) or {}
    name = (data.get("category_name") or data.get("name") or "").strip()
    features = data.get("features") or []

    if not name:
        return error("O nome da categoria é obrigatório.", status=400)
    if not isinstance(features, list):
        return error("O campo features deve ser uma lista.", status=400)

    ok, message, category = inventory_service.update_category_with_features(category_id, name, features, get_current_user_id())
    if not ok:
        return error(message, status=400)
    return success(data=inventory_service.category_to_dict(category, include_features=True), message=message)


@categories_bp.route("/<int:category_id>", methods=["DELETE"])
@permission_required(Permission.CATEGORIES_REMOVE)
def delete_category(category_id: int):
    ok, message, category = inventory_service.delete_category(category_id, get_current_user_id())
    if not ok:
        return error(message, status=400)
    return success(data=inventory_service.category_to_dict(category, include_features=True), message=message)


@categories_bp.route("/<int:category_id>/features", methods=["GET"])
@permission_required(Permission.CATEGORIES_READ)
def list_features_for_category(category_id: int):
    features = inventory_service.get_features_by_category(category_id)
    return success(data=[inventory_service.feature_to_dict(feature) for feature in features])
