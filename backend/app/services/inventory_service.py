from __future__ import annotations

from datetime import date, datetime, timezone
from math import ceil
from typing import Any

from sqlalchemy import select

from app.extensions import db
from app.models.inventory import Asset, AssetSpec, Category, Feature
from app.models.location import Location
from app.utils.audit import log_action

VALID_ASSET_STATES = {"Bom Estado", "Necessita Manutenção", "Avariado", "Para Abate"}
VALID_FEATURE_TYPES = {"text", "number", "boolean", "date"}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _norm(value: Any) -> str:
    return _clean_text(value).lower()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _normalizar_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "sim", "yes", "on", "multiple", "multiplo", "múltiplo"}


def _flatten_json_value(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_flatten_json_value(item))
        return result
    if isinstance(value, dict):
        result: list[str] = []
        for item in value.values():
            result.extend(_flatten_json_value(item))
        return result
    return [str(value)]


def _iso(value):
    return value.isoformat() if value else None


def feature_to_dict(feature: Feature) -> dict:
    is_multiple = bool(getattr(feature, "is_multiple", False))
    return {
        "feature_id": feature.feature_id,
        "feature_name": feature.feature_name,
        "feature_type": feature.feature_type,
        "category_id": feature.category_id,
        "is_multiple": is_multiple,
        "is_repeatable": is_multiple,
        "is_active": feature.is_active,
    }


def category_to_dict(category: Category, include_features: bool = False) -> dict:
    data = {
        "category_id": category.category_id,
        "category_name": category.category_name,
        "is_active": category.is_active,
    }
    if include_features:
        data["features"] = [feature_to_dict(feature) for feature in get_features_by_category(category.category_id)]
    return data


def get_all_categories(include_features: bool = False) -> list[Category] | list[dict]:
    categories = db.session.execute(
        select(Category)
        .where(Category.is_active == True)
        .order_by(Category.category_name.asc())
    ).scalars().all()

    if include_features:
        return [category_to_dict(category, include_features=True) for category in categories]
    return categories


def get_features_by_category(category_id: int) -> list[Feature]:
    return db.session.execute(
        select(Feature)
        .where(Feature.category_id == category_id, Feature.is_active == True)
        .order_by(Feature.feature_name.asc())
    ).scalars().all()


def get_category_by_id(category_id: int) -> Category | None:
    return db.session.execute(
        select(Category).where(Category.category_id == category_id, Category.is_active == True)
    ).scalar_one_or_none()


def _normalize_single_feature_value(feature: Feature, raw_value: Any) -> tuple[Any | None, str | None]:
    if raw_value is None:
        return None, None

    value = str(raw_value).strip()
    if value == "":
        return None, None

    feature_type = (feature.feature_type or "text").lower()

    if feature_type == "number":
        normalized = value.replace(",", ".")
        try:
            number = float(normalized)
        except ValueError:
            return None, f"O campo '{feature.feature_name}' deve ser numérico."
        return int(number) if number.is_integer() else number, None

    if feature_type == "boolean":
        normalized = value.lower()
        if normalized in {"true", "1", "sim", "yes", "on"}:
            return True, None
        if normalized in {"false", "0", "nao", "não", "no", "off"}:
            return False, None
        return None, f"O campo '{feature.feature_name}' deve ser sim/não."

    if feature_type == "date":
        parsed = _parse_date(value)
        if not parsed:
            return None, f"O campo '{feature.feature_name}' deve ter uma data válida."
        return parsed.isoformat(), None

    return value, None


def _normalize_feature_value(feature: Feature, raw_value: Any) -> tuple[Any | None, str | None]:
    """Normaliza specs para JSONB.

    Features normais guardam um valor JSON escalar. Features com is_multiple=true
    guardam sempre uma lista JSON, permitindo vários CPUs, sticks de RAM, discos, etc.
    """
    is_multiple = bool(getattr(feature, "is_multiple", False))

    if isinstance(raw_value, list):
        normalized_values: list[Any] = []
        for item in raw_value:
            value, validation_error = _normalize_single_feature_value(feature, item)
            if validation_error:
                return None, validation_error
            if value is not None:
                normalized_values.append(value)

        if not normalized_values:
            return None, None
        if not is_multiple and len(normalized_values) > 1:
            return None, f"O campo '{feature.feature_name}' não permite múltiplos valores."
        return normalized_values if is_multiple else normalized_values[0], None

    value, validation_error = _normalize_single_feature_value(feature, raw_value)
    if validation_error or value is None:
        return value, validation_error

    return [value] if is_multiple else value, None


def _feature_is_multiple_from_payload(raw_feature: dict) -> bool:
    return _normalizar_bool(
        raw_feature.get("is_multiple")
        if "is_multiple" in raw_feature
        else raw_feature.get("is_repeatable")
        if "is_repeatable" in raw_feature
        else raw_feature.get("multiple")
        if "multiple" in raw_feature
        else raw_feature.get("repeatable")
        if "repeatable" in raw_feature
        else raw_feature.get("multipla")
        if "multipla" in raw_feature
        else raw_feature.get("múltipla")
    )


def _validate_features_payload(features: list[dict]) -> tuple[bool, str]:
    names: set[str] = set()
    for raw_feature in features:
        name = _clean_text(
            raw_feature.get("feature_name")
            or raw_feature.get("name")
            or raw_feature.get("nome")
        )
        feature_type = _clean_text(
            raw_feature.get("feature_type")
            or raw_feature.get("type")
            or raw_feature.get("tipo")
            or "text"
        ).lower()

        if not name:
            return False, "Todas as características precisam de nome."
        if feature_type not in VALID_FEATURE_TYPES:
            return False, f"Tipo inválido para a característica '{name}'."
        if name.casefold() in names:
            return False, f"A característica '{name}' está repetida."
        names.add(name.casefold())

    return True, "Características válidas."


def create_category(name: str, admin_id: int | None = None) -> tuple[bool, str, Category | None]:
    return create_category_with_features(name=name, features=[], admin_id=admin_id)


def create_category_with_features(
    name: str,
    features: list[dict] | None,
    admin_id: int | None = None,
) -> tuple[bool, str, Category | None]:
    clean_name = _clean_text(name)
    features = features or []

    if not clean_name:
        return False, "O nome da categoria é obrigatório.", None

    ok, message = _validate_features_payload(features)
    if not ok:
        return False, message, None

    existing = db.session.execute(
        select(Category).where(Category.category_name == clean_name)
    ).scalar_one_or_none()

    if existing and existing.is_active:
        return False, "Esta categoria já existe.", None

    if existing:
        existing.is_active = True
        category = existing
    else:
        category = Category(category_name=clean_name)
        db.session.add(category)
        db.session.flush()

    ok, message = _sync_category_features(category.category_id, features, admin_id)
    if not ok:
        db.session.rollback()
        return False, message, None

    log_action(
        action="INSERT",
        table_name="categories",
        record_id=category.category_id,
        user_id=admin_id,
        new_value=category_to_dict(category, include_features=True),
    )
    db.session.commit()
    return True, "Categoria criada com sucesso.", category


def update_category_with_features(
    category_id: int,
    name: str,
    features: list[dict] | None,
    admin_id: int | None = None,
) -> tuple[bool, str, Category | None]:
    category = get_category_by_id(category_id)
    if not category:
        return False, "Categoria não encontrada.", None

    clean_name = _clean_text(name)
    features = features or []

    if not clean_name:
        return False, "O nome da categoria é obrigatório.", None

    ok, message = _validate_features_payload(features)
    if not ok:
        return False, message, None

    existing = db.session.execute(
        select(Category).where(Category.category_name == clean_name, Category.category_id != category_id)
    ).scalar_one_or_none()
    if existing:
        return False, "Já existe outra categoria com este nome.", None

    old_value = category_to_dict(category, include_features=True)
    category.category_name = clean_name

    ok, message = _sync_category_features(category.category_id, features, admin_id)
    if not ok:
        db.session.rollback()
        return False, message, None

    new_value = category_to_dict(category, include_features=True)
    log_action(
        action="UPDATE",
        table_name="categories",
        record_id=category.category_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Categoria atualizada com sucesso.", category


def delete_category(category_id: int, admin_id: int | None = None) -> tuple[bool, str, Category | None]:
    category = get_category_by_id(category_id)
    if not category:
        return False, "Categoria não encontrada.", None

    active_assets = db.session.execute(
        select(Asset.asset_id).where(Asset.category_id == category_id, Asset.is_active == True).limit(1)
    ).scalar_one_or_none()
    if active_assets:
        return False, "Não é possível remover uma categoria com ativos ativos associados.", None

    old_value = category_to_dict(category, include_features=True)
    category.is_active = False
    for feature in get_features_by_category(category.category_id):
        feature.is_active = False

    log_action(
        action="DELETE",
        table_name="categories",
        record_id=category.category_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=category_to_dict(category, include_features=True),
    )
    db.session.commit()
    return True, "Categoria removida com sucesso.", category


def create_feature(
    name: str,
    f_type: str,
    category_id: int,
    admin_id: int | None = None,
    is_multiple: bool = False,
) -> tuple[bool, str, Feature | None]:
    category = get_category_by_id(category_id)
    if not category:
        return False, "Categoria não encontrada.", None

    clean_name = _clean_text(name)
    feature_type = _clean_text(f_type or "text").lower()
    if not clean_name:
        return False, "O nome da característica é obrigatório.", None
    if feature_type not in VALID_FEATURE_TYPES:
        return False, "Tipo de característica inválida.", None

    existing = db.session.execute(
        select(Feature).where(Feature.category_id == category_id, Feature.feature_name == clean_name)
    ).scalar_one_or_none()

    if existing and existing.is_active:
        return False, "Esta característica já existe para esta categoria.", None

    if existing:
        existing.is_active = True
        existing.feature_type = feature_type
        existing.is_multiple = bool(is_multiple)
        feature = existing
    else:
        feature = Feature(feature_name=clean_name, feature_type=feature_type, category_id=category_id, is_multiple=bool(is_multiple))
        db.session.add(feature)
        db.session.flush()

    log_action(
        action="INSERT",
        table_name="features",
        record_id=feature.feature_id,
        user_id=admin_id,
        new_value=feature_to_dict(feature),
    )
    db.session.commit()
    return True, "Característica criada com sucesso.", feature


def _sync_category_features(category_id: int, features: list[dict], admin_id: int | None = None) -> tuple[bool, str]:
    existing_features = db.session.execute(
        select(Feature).where(Feature.category_id == category_id)
    ).scalars().all()

    by_id = {str(feature.feature_id): feature for feature in existing_features}
    by_name = {feature.feature_name.casefold(): feature for feature in existing_features}
    touched: set[int] = set()

    for raw_feature in features:
        name = _clean_text(raw_feature.get("feature_name") or raw_feature.get("name") or raw_feature.get("nome"))
        feature_type = _clean_text(raw_feature.get("feature_type") or raw_feature.get("type") or raw_feature.get("tipo") or "text").lower()
        is_multiple = _feature_is_multiple_from_payload(raw_feature)
        raw_id = raw_feature.get("feature_id") or raw_feature.get("id") or raw_feature.get("id_feature")

        feature = by_id.get(str(raw_id)) if raw_id else by_name.get(name.casefold())
        if feature and feature.category_id != category_id:
            return False, f"A característica '{name}' não pertence a esta categoria."

        if not feature:
            feature = Feature(
                category_id=category_id,
                feature_name=name,
                feature_type=feature_type,
                is_multiple=is_multiple,
                is_active=True,
            )
            db.session.add(feature)
            db.session.flush()
            by_id[str(feature.feature_id)] = feature
            by_name[name.casefold()] = feature
            log_action(
                action="INSERT",
                table_name="features",
                record_id=feature.feature_id,
                user_id=admin_id,
                new_value=feature_to_dict(feature),
            )
        else:
            old_value = feature_to_dict(feature)
            feature.feature_name = name
            feature.feature_type = feature_type
            feature.is_multiple = is_multiple
            feature.is_active = True
            if old_value != feature_to_dict(feature):
                log_action(
                    action="UPDATE",
                    table_name="features",
                    record_id=feature.feature_id,
                    user_id=admin_id,
                    old_value=old_value,
                    new_value=feature_to_dict(feature),
                )

        touched.add(feature.feature_id)

    for feature in existing_features:
        if feature.feature_id not in touched and feature.is_active:
            old_value = feature_to_dict(feature)
            feature.is_active = False
            log_action(
                action="DELETE",
                table_name="features",
                record_id=feature.feature_id,
                user_id=admin_id,
                old_value=old_value,
                new_value=feature_to_dict(feature),
            )

    return True, "Características sincronizadas com sucesso."


def _get_specs_for_asset(asset_id: int) -> tuple[dict, list[dict]]:
    rows = db.session.execute(
        select(Feature, AssetSpec)
        .join(AssetSpec, AssetSpec.feature_id == Feature.feature_id)
        .where(
            AssetSpec.asset_id == asset_id,
            AssetSpec.is_active == True,
            Feature.is_active == True,
        )
        .order_by(Feature.feature_name.asc())
    ).all()

    specs: dict[str, Any] = {}
    details: list[dict] = []
    for feature, spec in rows:
        value = spec.content
        is_multiple = bool(getattr(feature, "is_multiple", False))
        specs[feature.feature_name] = value
        details.append({
            "spec_id": spec.spec_id,
            "feature_id": feature.feature_id,
            "feature_name": feature.feature_name,
            "feature_type": feature.feature_type,
            "is_multiple": is_multiple,
            "is_repeatable": is_multiple,
            "content": value,
            "spec_value": value,
        })
    return specs, details


def asset_to_dict(
    asset: Asset,
    category_name: str | None = None,
    location_name: str | None = None,
    specs: dict | None = None,
    specs_details: list[dict] | None = None,
) -> dict:
    if category_name is None:
        category_name = db.session.execute(
            select(Category.category_name).where(Category.category_id == asset.category_id)
        ).scalar_one_or_none()
    if location_name is None:
        location_name = db.session.execute(
            select(Location.location_name).where(Location.location_id == asset.location_id)
        ).scalar_one_or_none()
    if specs is None or specs_details is None:
        specs, specs_details = _get_specs_for_asset(asset.asset_id)

    return {
        "asset_id": asset.asset_id,
        "serial_number": asset.serial_number,
        "category_id": asset.category_id,
        "category_name": category_name,
        "location_id": asset.location_id,
        "location_name": location_name,
        "asset_state": asset.asset_state,
        "status": asset.asset_state,
        "assigned_to": asset.assigned_to or "-",
        "assigned_at": _iso(asset.assigned_at),
        "registered_at": _iso(asset.registered_at),
        "created_at": _iso(asset.registered_at),
        "last_maintenance": _iso(asset.last_maintenance),
        "maintenance_period_months": asset.maintenance_period_months,
        "is_active": asset.is_active,
        "specs": specs or {},
        "specs_details": specs_details or [],
    }


def _asset_matches_search(asset: dict, search: str | None) -> bool:
    term = _norm(search)
    if not term:
        return True

    haystack_parts = [
        asset.get("asset_id"),
        asset.get("serial_number"),
        asset.get("category_name"),
        asset.get("location_name"),
        asset.get("asset_state"),
        asset.get("assigned_to"),
        asset.get("registered_at"),
    ]
    for detail in asset.get("specs_details", []):
        haystack_parts.extend([detail.get("feature_name"), detail.get("feature_type")])
        haystack_parts.extend(_flatten_json_value(detail.get("content", detail.get("spec_value"))))
    haystack = _norm(" ".join(str(part) for part in haystack_parts if part is not None))
    return all(word in haystack for word in term.split())


def _spec_values_for_filter(asset: dict, raw_filter: dict) -> list[str]:
    feature_id = _clean_text(raw_filter.get("feature_id") or raw_filter.get("id"))
    feature_name = _norm(raw_filter.get("feature_name") or raw_filter.get("name"))
    values: list[str] = []
    for detail in asset.get("specs_details", []):
        same_id = feature_id and str(detail.get("feature_id")) == feature_id
        same_name = feature_name and feature_name in _norm(detail.get("feature_name"))
        if same_id or same_name:
            values.extend(_flatten_json_value(detail.get("content", detail.get("spec_value"))))
    return values


def _matches_operator(values: list[str], operator: str, expected: Any) -> bool:
    operator = _norm(operator or "contains")
    expected_text = _clean_text(expected)
    if operator in {"exists", "has_value"}:
        return any(_clean_text(value) for value in values)
    if not expected_text:
        return True
    expected_norm = _norm(expected_text)
    values_norm = [_norm(value) for value in values]

    if operator in {"equals", "eq", "igual"}:
        return any(value == expected_norm for value in values_norm)
    if operator in {"not_equals", "ne", "diferente"}:
        return all(value != expected_norm for value in values_norm)
    if operator in {"not_contains", "nao_contem"}:
        return all(expected_norm not in value for value in values_norm)
    if operator in {"gt", "gte", "lt", "lte", "greater_than", "greater_or_equal", "less_than", "less_or_equal"}:
        try:
            expected_number = float(expected_text.replace(",", "."))
            numbers = [float(value.replace(",", ".")) for value in values if _clean_text(value)]
        except ValueError:
            return False
        if operator in {"gt", "greater_than"}:
            return any(number > expected_number for number in numbers)
        if operator in {"gte", "greater_or_equal"}:
            return any(number >= expected_number for number in numbers)
        if operator in {"lt", "less_than"}:
            return any(number < expected_number for number in numbers)
        return any(number <= expected_number for number in numbers)
    return any(expected_norm in value for value in values_norm)


def _asset_matches_spec_filters(asset: dict, spec_filters: list[dict] | None) -> bool:
    for raw_filter in spec_filters or []:
        values = _spec_values_for_filter(asset, raw_filter)
        if not values:
            return False
        if not _matches_operator(values, raw_filter.get("operator") or "contains", raw_filter.get("value")):
            return False
    return True


def _sort_assets(assets: list[dict], sort: str | None) -> list[dict]:
    sort = sort or "date-desc"
    sort_map = {
        "category-asc": (lambda a: _norm(a.get("category_name")), False),
        "category-desc": (lambda a: _norm(a.get("category_name")), True),
        "location-asc": (lambda a: _norm(a.get("location_name")), False),
        "location-desc": (lambda a: _norm(a.get("location_name")), True),
        "status-asc": (lambda a: _norm(a.get("asset_state")), False),
        "status-desc": (lambda a: _norm(a.get("asset_state")), True),
        "date-desc": (lambda a: a.get("registered_at") or "", True),
        "date-asc": (lambda a: a.get("registered_at") or "", False),
        "id-asc": (lambda a: int(a.get("asset_id") or 0), False),
        "id-desc": (lambda a: int(a.get("asset_id") or 0), True),
    }
    key_func, reverse = sort_map.get(sort, sort_map["date-desc"])
    return sorted(assets, key=key_func, reverse=reverse)


def _paginate(items: list[dict], page: int | None, page_size: int | None) -> dict:
    safe_page_size = max(1, min(int(page_size or 10), 100))
    total = len(items)
    total_pages = max(1, ceil(total / safe_page_size))
    safe_page = max(1, min(int(page or 1), total_pages))
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    return {
        "items": items[start:end],
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": total,
            "total_pages": total_pages,
            "start_index": start + 1 if total else 0,
            "end_index": min(end, total),
        },
    }


def get_assets_by_filters(
    location_id=None,
    category_id=None,
    asset_state=None,
    assigned=None,
    manager_id=None,
    search: str | None = None,
    category_name: str | None = None,
    location_name: str | None = None,
    spec_filters: list[dict] | None = None,
    sort: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
):
    query = (
        select(Asset, Category.category_name, Location.location_name)
        .join(Category, Category.category_id == Asset.category_id)
        .join(Location, Location.location_id == Asset.location_id)
        .where(Asset.is_active == True, Category.is_active == True, Location.is_active == True)
    )
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)
    if location_id:
        query = query.where(Asset.location_id == location_id)
    if category_id:
        query = query.where(Asset.category_id == category_id)
    if asset_state:
        query = query.where(Asset.asset_state == asset_state)
    if assigned == "assigned":
        query = query.where(Asset.assigned_to.is_not(None))
    if assigned == "unassigned":
        query = query.where(Asset.assigned_to.is_(None))

    rows = db.session.execute(query).all()
    assets = [asset_to_dict(asset, category_name_loaded, location_name_loaded) for asset, category_name_loaded, location_name_loaded in rows]

    if category_name:
        assets = [asset for asset in assets if _norm(asset.get("category_name")) == _norm(category_name)]
    if location_name:
        assets = [asset for asset in assets if _norm(asset.get("location_name")) == _norm(location_name)]

    assets = [asset for asset in assets if _asset_matches_search(asset, search)]
    assets = [asset for asset in assets if _asset_matches_spec_filters(asset, spec_filters)]
    assets = _sort_assets(assets, sort)

    if page is not None or page_size is not None:
        return _paginate(assets, page, page_size)
    return assets


def get_asset_by_id(asset_id: int, manager_id: int | None = None) -> dict | None:
    query = (
        select(Asset, Category.category_name, Location.location_name)
        .join(Category, Category.category_id == Asset.category_id)
        .join(Location, Location.location_id == Asset.location_id)
        .where(Asset.asset_id == asset_id, Asset.is_active == True)
    )
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)
    row = db.session.execute(query).first()
    if not row:
        return None
    asset, category_name, location_name = row
    return asset_to_dict(asset, category_name, location_name)


def _validate_location_for_user(location_id: int, user_id: int | None, role: str | None) -> tuple[bool, str, Location | None]:
    location = db.session.execute(
        select(Location).where(Location.location_id == location_id, Location.is_active == True)
    ).scalar_one_or_none()
    if not location:
        return False, "Localização não encontrada.", None
    if role == "Gestor" and location.location_manager_id != user_id:
        return False, "Não tem permissão para usar este local.", None
    return True, "Local válido.", location


def _normalize_specs(category_id: int, specs: dict | None) -> tuple[bool, dict[int, Any], str | None]:
    specs = specs or {}
    features = get_features_by_category(category_id)
    features_by_id = {str(feature.feature_id): feature for feature in features}
    features_by_name = {feature.feature_name: feature for feature in features}
    normalized: dict[int, Any] = {}

    for raw_key, raw_value in specs.items():
        key = str(raw_key)
        feature = features_by_id.get(key) or features_by_name.get(key)
        if not feature:
            return False, {}, f"A característica '{key}' não pertence a esta categoria."
        value, validation_error = _normalize_feature_value(feature, raw_value)
        if validation_error:
            return False, {}, validation_error
        if value is not None:
            normalized[feature.feature_id] = value
    return True, normalized, None


def create_asset(
    serial_number: str,
    category_id: int,
    location_id: int,
    state: str,
    specs: dict | None,
    admin_id: int | None = None,
    assigned_to: str | None = None,
    maintenance_period_months: int | None = None,
    last_maintenance=None,
    role: str | None = None,
) -> tuple[bool, str, dict | None]:
    serial_number = _clean_text(serial_number)
    state = _clean_text(state or "Bom Estado")
    assigned_to = _clean_text(assigned_to) or None

    if not serial_number or not category_id or not location_id:
        return False, "Número de série, categoria e local são obrigatórios.", None
    if state not in VALID_ASSET_STATES:
        return False, "Estado do ativo inválido.", None
    if maintenance_period_months is not None and int(maintenance_period_months) <= 0:
        return False, "Período de manutenção inválido.", None

    existing = db.session.execute(select(Asset).where(Asset.serial_number == serial_number)).scalar_one_or_none()
    if existing:
        return False, "Já existe um ativo com este número de série.", None

    category = get_category_by_id(category_id)
    if not category:
        return False, "Categoria não encontrada.", None

    ok, message, location = _validate_location_for_user(location_id, admin_id, role)
    if not ok:
        return False, message, None

    parsed_last_maintenance = _parse_date(last_maintenance)
    if last_maintenance and not parsed_last_maintenance:
        return False, "Data de última manutenção inválida.", None

    ok, normalized_specs, validation_error = _normalize_specs(category_id, specs)
    if not ok:
        return False, validation_error or "Características inválidas.", None

    asset = Asset(
        serial_number=serial_number,
        category_id=category_id,
        location_id=location_id,
        asset_state=state,
        assigned_to=assigned_to,
        assigned_at=_now() if assigned_to else None,
        maintenance_period_months=maintenance_period_months,
        last_maintenance=parsed_last_maintenance,
    )
    db.session.add(asset)
    db.session.flush()

    for feature_id, value in normalized_specs.items():
        db.session.add(AssetSpec(feature_id=feature_id, asset_id=asset.asset_id, content=value))

    new_value = asset_to_dict(asset, category.category_name, location.location_name)
    log_action(
        action="INSERT",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=admin_id,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Ativo registado com sucesso.", new_value


def update_asset(
    asset_id: int,
    serial_number: str,
    category_id: int,
    location_id: int,
    state: str,
    specs: dict | None,
    admin_id: int | None = None,
    assigned_to: str | None = None,
    maintenance_period_months: int | None = None,
    last_maintenance=None,
    role: str | None = None,
) -> tuple[bool, str, dict | None]:
    asset = db.session.get(Asset, asset_id)
    if not asset or not asset.is_active:
        return False, "Ativo não encontrado.", None

    if role == "Gestor":
        current_location = db.session.get(Location, asset.location_id)
        if not current_location or current_location.location_manager_id != admin_id:
            return False, "Não tem permissão para editar este ativo.", None

    serial_number = _clean_text(serial_number)
    state = _clean_text(state or "Bom Estado")
    assigned_to = _clean_text(assigned_to) or None

    if not serial_number or not category_id or not location_id:
        return False, "Número de série, categoria e local são obrigatórios.", None
    if state not in VALID_ASSET_STATES:
        return False, "Estado do ativo inválido.", None

    existing = db.session.execute(
        select(Asset).where(Asset.serial_number == serial_number, Asset.asset_id != asset_id)
    ).scalar_one_or_none()
    if existing:
        return False, "Já existe outro ativo com este número de série.", None

    category = get_category_by_id(category_id)
    if not category:
        return False, "Categoria não encontrada.", None

    ok, message, location = _validate_location_for_user(location_id, admin_id, role)
    if not ok:
        return False, message, None

    parsed_last_maintenance = _parse_date(last_maintenance)
    if last_maintenance and not parsed_last_maintenance:
        return False, "Data de última manutenção inválida.", None

    ok, normalized_specs, validation_error = _normalize_specs(category_id, specs)
    if not ok:
        return False, validation_error or "Características inválidas.", None

    old_value = asset_to_dict(asset)

    old_assigned = asset.assigned_to
    asset.serial_number = serial_number
    asset.category_id = category_id
    asset.location_id = location_id
    asset.asset_state = state
    asset.assigned_to = assigned_to
    asset.maintenance_period_months = maintenance_period_months
    asset.last_maintenance = parsed_last_maintenance
    if assigned_to and assigned_to != old_assigned:
        asset.assigned_at = _now()
    if not assigned_to:
        asset.assigned_at = None

    existing_specs = db.session.execute(select(AssetSpec).where(AssetSpec.asset_id == asset_id)).scalars().all()
    specs_by_feature = {spec.feature_id: spec for spec in existing_specs}
    for feature_id, value in normalized_specs.items():
        spec = specs_by_feature.get(feature_id)
        if spec:
            spec.content = value
            spec.is_active = True
        else:
            db.session.add(AssetSpec(feature_id=feature_id, asset_id=asset_id, content=value, is_active=True))
    for spec in existing_specs:
        if spec.feature_id not in normalized_specs:
            spec.is_active = False

    db.session.flush()
    new_value = asset_to_dict(asset, category.category_name, location.location_name)
    log_action(
        action="UPDATE",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Ativo atualizado com sucesso.", new_value


def delete_asset(asset_id: int, admin_id: int | None = None, role: str | None = None) -> tuple[bool, str, dict | None]:
    asset = db.session.get(Asset, asset_id)
    if not asset or not asset.is_active:
        return False, "Ativo não encontrado.", None

    if role == "Gestor":
        location = db.session.get(Location, asset.location_id)
        if not location or location.location_manager_id != admin_id:
            return False, "Não tem permissão para remover este ativo.", None

    old_value = asset_to_dict(asset)
    asset.is_active = False
    for spec in db.session.execute(
        select(AssetSpec).where(AssetSpec.asset_id == asset.asset_id, AssetSpec.is_active == True)
    ).scalars().all():
        spec.is_active = False

    log_action(
        action="DELETE",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=admin_id,
        old_value=old_value,
        new_value={**old_value, "is_active": False},
    )
    db.session.commit()
    return True, "Ativo removido com sucesso.", {**old_value, "is_active": False}
