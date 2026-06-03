from __future__ import annotations

from datetime import date, datetime, timezone
from math import ceil
from typing import Any

from sqlalchemy import Float, String, and_, case, cast, func, or_, select

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


def get_features_by_category(category_id: int, include_inactive: bool = False) -> list[Feature]:
    query = select(Feature).where(Feature.category_id == category_id)
    if not include_inactive:
        query = query.where(Feature.is_active == True)
    return db.session.execute(
        query.order_by(Feature.feature_name.asc())
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
        )
        .order_by(Feature.is_active.desc(), Feature.feature_name.asc())
    ).all()

    specs: dict[str, Any] = {}
    details: list[dict] = []
    for feature, spec in rows:
        value = spec.content
        is_multiple = bool(getattr(feature, "is_multiple", False))
        feature_is_active = bool(getattr(feature, "is_active", False))
        specs[feature.feature_name] = value
        details.append({
            "spec_id": spec.spec_id,
            "feature_id": feature.feature_id,
            "feature_name": feature.feature_name,
            "feature_type": feature.feature_type,
            "is_multiple": is_multiple,
            "is_repeatable": is_multiple,
            "feature_is_active": feature_is_active,
            "feature_status": "Ativa" if feature_is_active else "Desativada",
            "is_archived_feature": not feature_is_active,
            "content": value,
            "spec_value": value,
        })
    return specs, details




def _get_specs_for_assets(asset_ids: list[int]) -> dict[int, tuple[dict[str, Any], list[dict]]]:
    """Carrega specs de vários ativos numa só query para evitar N+1 queries."""
    if not asset_ids:
        return {}

    rows = db.session.execute(
        select(AssetSpec.asset_id, Feature, AssetSpec)
        .join(Feature, Feature.feature_id == AssetSpec.feature_id)
        .where(
            AssetSpec.asset_id.in_(asset_ids),
            AssetSpec.is_active == True,
        )
        .order_by(AssetSpec.asset_id.asc(), Feature.is_active.desc(), Feature.feature_name.asc())
    ).all()

    grouped: dict[int, tuple[dict[str, Any], list[dict]]] = {
        int(asset_id): ({}, []) for asset_id in asset_ids
    }

    for asset_id, feature, spec in rows:
        specs, details = grouped.setdefault(int(asset_id), ({}, []))
        value = spec.content
        is_multiple = bool(getattr(feature, "is_multiple", False))
        feature_is_active = bool(getattr(feature, "is_active", False))
        specs[feature.feature_name] = value
        details.append({
            "spec_id": spec.spec_id,
            "feature_id": feature.feature_id,
            "feature_name": feature.feature_name,
            "feature_type": feature.feature_type,
            "is_multiple": is_multiple,
            "is_repeatable": is_multiple,
            "feature_is_active": feature_is_active,
            "feature_status": "Ativa" if feature_is_active else "Desativada",
            "is_archived_feature": not feature_is_active,
            "content": value,
            "spec_value": value,
        })

    return grouped

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



def _safe_page_values(page: int | None, page_size: int | None, total: int) -> tuple[int, int, int, int, int]:
    safe_page_size = max(1, min(int(page_size or 10), 100))
    total_pages = max(1, ceil(total / safe_page_size))
    safe_page = max(1, min(int(page or 1), total_pages))
    offset = (safe_page - 1) * safe_page_size
    limit = safe_page_size
    return safe_page, safe_page_size, total_pages, offset, limit


def _pagination_payload(page: int, page_size: int, total_pages: int, total: int) -> dict:
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "start_index": start + 1 if total else 0,
        "end_index": min(end, total),
    }


def _sort_expression(sort: str | None):
    sort = sort or "date-desc"
    sort_map = {
        "category-asc": Category.category_name.asc(),
        "category-desc": Category.category_name.desc(),
        "location-asc": Location.location_name.asc(),
        "location-desc": Location.location_name.desc(),
        "status-asc": Asset.asset_state.asc(),
        "status-desc": Asset.asset_state.desc(),
        "date-desc": Asset.registered_at.desc(),
        "date-asc": Asset.registered_at.asc(),
        "id-asc": Asset.asset_id.asc(),
        "id-desc": Asset.asset_id.desc(),
    }
    return sort_map.get(sort, sort_map["date-desc"])


def _asset_search_conditions(word: str):
    pattern = f"%{word}%"
    specs_exists = (
        select(AssetSpec.spec_id)
        .join(Feature, Feature.feature_id == AssetSpec.feature_id)
        .where(
            AssetSpec.asset_id == Asset.asset_id,
            AssetSpec.is_active == True,
            or_(
                Feature.feature_name.ilike(pattern),
                cast(Feature.feature_type, String).ilike(pattern),
                cast(AssetSpec.content, String).ilike(pattern),
            ),
        )
        .exists()
    )
    return or_(
        cast(Asset.asset_id, String).ilike(pattern),
        Asset.serial_number.ilike(pattern),
        Category.category_name.ilike(pattern),
        Location.location_name.ilike(pattern),
        cast(Asset.asset_state, String).ilike(pattern),
        Asset.assigned_to.ilike(pattern),
        cast(Asset.registered_at, String).ilike(pattern),
        specs_exists,
    )


def _json_text_expression():
    return cast(AssetSpec.content, String)


def _apply_spec_filter(query, raw_filter: dict):
    feature_id = _to_int(raw_filter.get("feature_id") or raw_filter.get("id"))
    feature_name = _clean_text(raw_filter.get("feature_name") or raw_filter.get("name"))
    operator = _norm(raw_filter.get("operator") or "contains")
    expected = _clean_text(raw_filter.get("value"))

    conditions = [
        AssetSpec.asset_id == Asset.asset_id,
        AssetSpec.is_active == True,
    ]
    if feature_id:
        conditions.append(AssetSpec.feature_id == feature_id)
    elif feature_name:
        conditions.append(Feature.feature_name.ilike(f"%{feature_name}%"))

    content_text = _json_text_expression()
    comparable_content = func.lower(func.replace(content_text, '"', ''))
    expected_norm = expected.lower()

    if operator in {"exists", "has_value"}:
        value_condition = AssetSpec.content.is_not(None)
    elif not expected:
        value_condition = AssetSpec.content.is_not(None)
    elif operator in {"equals", "eq", "igual"}:
        value_condition = comparable_content == expected_norm
    elif operator in {"not_equals", "ne", "diferente"}:
        value_condition = comparable_content != expected_norm
    elif operator in {"not_contains", "nao_contem"}:
        value_condition = ~content_text.ilike(f"%{expected}%")
    elif operator in {"gt", "gte", "lt", "lte", "greater_than", "greater_or_equal", "less_than", "less_or_equal"}:
        try:
            expected_number = float(expected.replace(",", "."))
        except ValueError:
            value_condition = False
        else:
            conditions.append(Feature.feature_type == "number")
            conditions.append(func.jsonb_typeof(AssetSpec.content) == "number")
            numeric_content = cast(
                case(
                    (
                        func.jsonb_typeof(AssetSpec.content) == "number",
                        cast(AssetSpec.content, String),
                    ),
                    else_=None,
                ),
                Float,
            )
            if operator in {"gt", "greater_than"}:
                value_condition = numeric_content > expected_number
            elif operator in {"gte", "greater_or_equal"}:
                value_condition = numeric_content >= expected_number
            elif operator in {"lt", "less_than"}:
                value_condition = numeric_content < expected_number
            else:
                value_condition = numeric_content <= expected_number
    else:
        value_condition = content_text.ilike(f"%{expected}%")

    conditions.append(value_condition)
    return query.where(
        select(AssetSpec.spec_id)
        .join(Feature, Feature.feature_id == AssetSpec.feature_id)
        .where(and_(*conditions))
        .exists()
    )


def _base_assets_query():
    return (
        select(Asset, Category.category_name, Location.location_name)
        .join(Category, Category.category_id == Asset.category_id)
        .join(Location, Location.location_id == Asset.location_id)
        .where(Asset.is_active == True, Category.is_active == True, Location.is_active == True)
    )


def _apply_asset_filters(
    query,
    *,
    location_id=None,
    category_id=None,
    asset_state=None,
    assigned=None,
    manager_id=None,
    search: str | None = None,
    category_name: str | None = None,
    location_name: str | None = None,
    spec_filters: list[dict] | None = None,
):
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)
    if location_id:
        query = query.where(Asset.location_id == location_id)
    if category_id:
        query = query.where(Asset.category_id == category_id)
    if asset_state:
        query = query.where(Asset.asset_state == asset_state)
    if assigned == "assigned":
        query = query.where(Asset.assigned_to.is_not(None), Asset.assigned_to != "")
    if assigned == "unassigned":
        query = query.where(or_(Asset.assigned_to.is_(None), Asset.assigned_to == ""))
    if category_name:
        query = query.where(func.lower(Category.category_name) == _norm(category_name))
    if location_name:
        query = query.where(func.lower(Location.location_name) == _norm(location_name))

    for word in _norm(search).split():
        query = query.where(_asset_search_conditions(word))

    for raw_filter in spec_filters or []:
        query = _apply_spec_filter(query, raw_filter)

    return query


def _rows_to_asset_dicts(rows) -> list[dict]:
    asset_ids = [int(asset.asset_id) for asset, _, _ in rows]
    specs_by_asset = _get_specs_for_assets(asset_ids)
    return [
        asset_to_dict(
            asset,
            category_name_loaded,
            location_name_loaded,
            *(specs_by_asset.get(int(asset.asset_id), ({}, []))),
        )
        for asset, category_name_loaded, location_name_loaded in rows
    ]


def get_assets_summary(manager_id: int | None = None) -> dict:
    query = (
        select(Asset.asset_state, func.count(Asset.asset_id))
        .join(Location, Location.location_id == Asset.location_id)
        .join(Category, Category.category_id == Asset.category_id)
        .where(Asset.is_active == True, Location.is_active == True, Category.is_active == True)
    )
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)

    rows = db.session.execute(query.group_by(Asset.asset_state)).all()
    state_counts = {state: int(count) for state, count in rows}
    total = sum(state_counts.values())

    return {
        "total": total,
        "state_counts": state_counts,
        "states": [
            {"asset_state": state, "count": state_counts.get(state, 0)}
            for state in VALID_ASSET_STATES
        ],
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
    query = _apply_asset_filters(
        _base_assets_query(),
        location_id=location_id,
        category_id=category_id,
        asset_state=asset_state,
        assigned=assigned,
        manager_id=manager_id,
        search=search,
        category_name=category_name,
        location_name=location_name,
        spec_filters=spec_filters,
    )

    query = query.order_by(_sort_expression(sort), Asset.asset_id.desc())

    if page is not None or page_size is not None:
        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int(db.session.execute(count_query).scalar() or 0)
        safe_page, safe_page_size, total_pages, offset, limit = _safe_page_values(page, page_size, total)
        rows = db.session.execute(query.offset(offset).limit(limit)).all()
        return {
            "items": _rows_to_asset_dicts(rows),
            "pagination": _pagination_payload(safe_page, safe_page_size, total_pages, total),
        }

    rows = db.session.execute(query).all()
    return _rows_to_asset_dicts(rows)


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
    if parsed_last_maintenance is None:
        parsed_last_maintenance = date.today()

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

    old_asset_state = asset.asset_state
    if state == "Bom Estado" and old_asset_state != "Bom Estado":
        parsed_last_maintenance = date.today()

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
        if spec.feature_id in normalized_specs:
            continue

        feature = db.session.get(Feature, spec.feature_id)
        if not feature or feature.category_id != category_id or feature.is_active:
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
