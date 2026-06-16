from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.inventory import Asset, AssetSpec, Category, Feature
from app.models.location import Location
from app.models.user import User
from app.services import rollback_policy
from app.utils.audit import log_action


def has_already_been_rolled_back(log_id: int) -> bool:
    if not log_id:
        return False
    return db.session.execute(
        select(AuditLog.log_id)
        .where(AuditLog.origin == rollback_policy.rollback_origin_for_log_id(int(log_id)))
        .limit(1)
    ).scalar_one_or_none() is not None


def _manager_location_ids(manager_id: int | None) -> set[int]:
    if manager_id is None:
        return set()
    return {
        int(location_id)
        for location_id in db.session.execute(
            select(Location.location_id).where(
                Location.location_manager_id == manager_id,
                Location.is_active == True,
            )
        ).scalars().all()
    }


def _snapshot_location_id(snapshot: Any) -> int | None:
    if not isinstance(snapshot, dict):
        return None
    return _to_int(
        snapshot.get("location_id")
        or snapshot.get("local_id")
        or snapshot.get("id_location")
        or snapshot.get("id_local")
    )


def _current_asset_location_id(asset_id: int | None) -> int | None:
    if not asset_id:
        return None
    return db.session.execute(
        select(Asset.location_id).where(Asset.asset_id == asset_id).limit(1)
    ).scalar_one_or_none()


def asset_log_location_ids(log: AuditLog | None) -> set[int]:
    if not log or rollback_policy.normalized_table_name(log.table_name) != "assets":
        return set()

    raw_ids = {
        _current_asset_location_id(log.record_id),
        _snapshot_location_id(log.old_value),
        _snapshot_location_id(log.new_value),
    }
    return {int(location_id) for location_id in raw_ids if location_id is not None}


def is_log_visible_to_manager(log: AuditLog | None, manager_id: int | None) -> bool:
    if not log or manager_id is None:
        return False
    if (
        rollback_policy.normalized_table_name(log.table_name)
        not in rollback_policy.MANAGER_ROLLBACKABLE_TABLES
    ):
        return False
    return bool(asset_log_location_ids(log) & _manager_location_ids(manager_id))


def _manager_rollback_target_location_id(log: AuditLog) -> int | None:
    action = rollback_policy.normalized_action(log.action)
    if action in {"UPDATE", "DELETE"}:
        return _snapshot_location_id(log.old_value)
    if action == "INSERT":
        return _snapshot_location_id(log.new_value) or _current_asset_location_id(log.record_id)
    return None


def can_manager_rollback_log(log: AuditLog | None, manager_id: int | None) -> tuple[bool, str]:
    if not log or manager_id is None:
        return False, "Registo de auditoria não encontrado."

    if (
        rollback_policy.normalized_table_name(log.table_name)
        not in rollback_policy.MANAGER_ROLLBACKABLE_TABLES
    ):
        return False, "Gestores só podem reverter registos de ativos."

    manager_locations = _manager_location_ids(manager_id)
    if not manager_locations:
        return False, "Não tens salas atribuídas para poder reverter registos."

    if not (asset_log_location_ids(log) & manager_locations):
        return False, "Este registo não pertence às tuas salas atribuídas."

    target_location_id = _manager_rollback_target_location_id(log)
    if target_location_id is not None and target_location_id not in manager_locations:
        return False, "O rollback iria colocar o ativo fora das tuas salas atribuídas."

    return True, "Rollback disponível."


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _clean_or_none(value: Any) -> str | None:
    text = _clean(value)
    if not text or text == "-":
        return None
    return text


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    return str(value).strip().lower() in {"1", "true", "sim", "yes", "on", "ativo", "ativa"}


def _parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None


def is_rollbackable(
    log: AuditLog | None,
    actor_id: int | None = None,
    actor_role: str | None = None,
) -> tuple[bool, str]:
    if not log:
        return False, "Registo de auditoria não encontrado."

    if rollback_policy.is_rollback_origin(log.origin):
        return False, "Este registo já foi criado por um rollback."

    if has_already_been_rolled_back(log.log_id):
        return False, "Este registo já foi revertido."

    action = rollback_policy.normalized_action(log.action)
    table_name = rollback_policy.normalized_table_name(log.table_name)
    actor_role = rollback_policy.normalized_role(actor_role)

    if action not in rollback_policy.ROLLBACKABLE_ACTIONS:
        return False, "Tipo de ação sem suporte para rollback."

    if rollback_policy.blocks_user_security_rollback(log):
        return (
            False,
            "Ações de utilizadores, MFA, palavras-passe ou estado de registo não podem ser revertidas por segurança.",
        )

    if table_name not in rollback_policy.ADMIN_ROLLBACKABLE_TABLES:
        return (
            False,
            "Rollback disponível apenas para Locais, Categorias, Features, Specs e remoção/desativação de contas.",
        )

    if table_name == "users" and actor_role != "Administrador":
        return False, "Apenas administradores podem reverter remoção/desativação de contas."

    if actor_role == "Gestor":
        manager_ok, manager_reason = can_manager_rollback_log(log, actor_id)
        if not manager_ok:
            return False, manager_reason

    if action in {"UPDATE", "DELETE"} and not log.old_value:
        return False, "Este registo não tem dados anteriores para restaurar."

    if action == "INSERT" and not log.new_value:
        return False, "Este registo não tem dados novos para reverter."

    return True, "Rollback disponível."


def rollback_log(
    log_id: int,
    actor_id: int | None = None,
    actor_role: str | None = None,
) -> tuple[bool, str, dict | None]:
    log = db.session.get(AuditLog, log_id)
    ok, reason = is_rollbackable(log, actor_id=actor_id, actor_role=actor_role)
    if not ok:
        return False, reason, None

    rollback_handlers = {
        "categories": _rollback_category,
        "features": _rollback_feature,
        "locations": _rollback_location,
        "asset_specs": _rollback_asset_spec,
        "specs": _rollback_asset_spec,
        "users": _rollback_user_deactivation,
    }

    try:
        table_name = rollback_policy.normalized_table_name(log.table_name)
        handler = rollback_handlers.get(table_name)
        if not handler:
            return (
                False,
                "Rollback disponível apenas para Locais, Categorias, Features, Specs e remoção/desativação de contas.",
                None,
            )

        data = handler(log, actor_id)
        db.session.commit()
        return True, "Rollback executado com sucesso.", data
    except ValueError as exc:
        db.session.rollback()
        return False, str(exc), None
    except IntegrityError:
        db.session.rollback()
        return (
            False,
            "Rollback bloqueado por uma restrição da base de dados. Verifica duplicados ou dependências ativas.",
            None,
        )


def _current_user_location_ids(user_id: int) -> list[int]:
    return [
        int(location_id)
        for location_id in db.session.execute(
            select(Location.location_id)
            .where(Location.location_manager_id == user_id, Location.is_active == True)
            .order_by(Location.location_id.asc())
        ).scalars().all()
    ]


def _user_snapshot_dict(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "registration_status": user.registration_status,
        "mfa_enabled": user.mfa_enabled,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "location_ids": _current_user_location_ids(user.user_id),
    }


def _to_int_list(value: Any) -> list[int]:
    if value in (None, ""):
        return []
    raw_items = value if isinstance(value, list) else [value]
    parsed: list[int] = []
    seen: set[int] = set()

    for item in raw_items:
        parsed_item = _to_int(item)
        if parsed_item is None or parsed_item in seen:
            continue
        parsed.append(parsed_item)
        seen.add(parsed_item)

    return parsed


def _restore_user_locations(user: User, snapshot: dict) -> None:
    if "location_ids" not in snapshot:
        return

    location_ids = _to_int_list(snapshot.get("location_ids"))
    selected_ids = set(location_ids)

    current_locations = db.session.execute(
        select(Location).where(Location.location_manager_id == user.user_id).with_for_update()
    ).scalars().all()

    for location in current_locations:
        if location.location_id not in selected_ids:
            location.location_manager_id = None

    if not selected_ids:
        return

    locations = db.session.execute(
        select(Location)
        .where(Location.location_id.in_(location_ids), Location.is_active == True)
        .with_for_update()
    ).scalars().all()

    found_ids = {location.location_id for location in locations}
    missing_ids = selected_ids - found_ids
    if missing_ids:
        raise ValueError("Não foi possível restaurar: uma ou mais salas atribuídas já não existem ou estão inativas.")

    unavailable = [
        location
        for location in locations
        if location.location_manager_id is not None
        and location.location_manager_id != user.user_id
    ]
    if unavailable:
        raise ValueError("Não foi possível restaurar: uma ou mais salas já têm outro gestor associado.")

    for location in locations:
        location.location_manager_id = user.user_id


def _rollback_user_deactivation(log: AuditLog, actor_id: int | None) -> dict:
    if not rollback_policy.is_user_account_deactivation_log(log):
        raise ValueError("Apenas remoção/desativação de contas pode ser revertida.")

    user = db.session.get(User, log.record_id)
    if not user:
        raise ValueError("Utilizador não encontrado na base de dados.")

    if user.is_active:
        raise ValueError("A conta já se encontra ativa.")

    snapshot = log.old_value or {}
    email = _clean(snapshot.get("email"))
    role = _clean(snapshot.get("role") or user.role)
    registration_status = _clean(snapshot.get("registration_status") or user.registration_status)

    if not email:
        raise ValueError("O registo antigo do utilizador está incompleto.")

    conflict = db.session.execute(
        select(User.user_id)
        .where(User.email == email, User.user_id != user.user_id)
        .limit(1)
    ).scalar_one_or_none()
    if conflict:
        raise ValueError("Não foi possível restaurar: já existe outro utilizador com o mesmo email.")

    old_current = _user_snapshot_dict(user)

    user.email = email
    user.role = role
    user.registration_status = registration_status
    user.mfa_enabled = _to_bool(snapshot.get("mfa_enabled"), user.mfa_enabled)
    user.is_active = True
    _restore_user_locations(user, snapshot)

    db.session.flush()
    new_value = _user_snapshot_dict(user)

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        user_id=actor_id,
        origin=_rollback_origin(log),
        old_value=old_current,
        new_value=new_value,
    )
    return new_value


def _rollback_origin(log: AuditLog) -> str:
    return rollback_policy.rollback_origin_for_log_id(log.log_id)


def _ensure_no_other_asset_with_serial(asset_id: int, serial_number: str) -> None:
    conflict = db.session.execute(
        select(Asset.asset_id).where(Asset.serial_number == serial_number, Asset.asset_id != asset_id).limit(1)
    ).scalar_one_or_none()
    if conflict:
        raise ValueError("Não foi possível restaurar: já existe outro ativo com o mesmo código interno.")


def _asset_snapshot_dict(asset: Asset) -> dict:
    from app.services.inventory_service import asset_to_dict

    return asset_to_dict(asset)


def _has_complete_asset_snapshot(snapshot: dict) -> bool:
    if not isinstance(snapshot, dict):
        return False
    return bool(
        _clean(snapshot.get("serial_number"))
        and _to_int(snapshot.get("category_id"))
        and _to_int(snapshot.get("location_id"))
    )


def _merge_partial_asset_snapshot(current_snapshot: dict, rollback_snapshot: dict) -> dict:
    merged = dict(current_snapshot)
    if isinstance(rollback_snapshot, dict):
        for key, value in rollback_snapshot.items():
            if key == "specs_details" and not value:
                continue
            merged[key] = value
    return merged


def _apply_asset_snapshot(asset: Asset, snapshot: dict) -> None:
    serial_number = _clean(snapshot.get("serial_number"))
    category_id = _to_int(snapshot.get("category_id"))
    location_id = _to_int(snapshot.get("location_id"))
    asset_state = _clean(snapshot.get("asset_state") or snapshot.get("status") or "Bom Estado")

    if not serial_number or not category_id or not location_id:
        raise ValueError("O registo antigo do ativo está incompleto.")

    if not db.session.get(Category, category_id):
        raise ValueError("Não foi possível restaurar: a categoria associada já não existe.")
    if not db.session.get(Location, location_id):
        raise ValueError("Não foi possível restaurar: o local associado já não existe.")

    _ensure_no_other_asset_with_serial(asset.asset_id, serial_number)

    assigned_to = _clean_or_none(snapshot.get("assigned_to"))
    asset.serial_number = serial_number
    asset.category_id = category_id
    asset.location_id = location_id
    asset.asset_state = asset_state
    asset.assigned_to = assigned_to
    asset.assigned_at = _parse_datetime(snapshot.get("assigned_at")) if assigned_to else None
    asset.last_maintenance = _parse_date(snapshot.get("last_maintenance"))
    asset.maintenance_period_months = _to_int(snapshot.get("maintenance_period_months"))
    asset.is_active = _to_bool(snapshot.get("is_active"), True)


def _asset_specs_from_snapshot(asset: Asset, snapshot: dict) -> dict[int, Any]:
    values_by_feature_id: dict[int, Any] = {}

    details = snapshot.get("specs_details")
    if isinstance(details, list):
        for detail in details:
            if not isinstance(detail, dict):
                continue
            feature_id = _to_int(detail.get("feature_id"))
            if not feature_id:
                continue
            value = detail.get("content", detail.get("spec_value"))
            if value not in (None, ""):
                values_by_feature_id[feature_id] = value

    if values_by_feature_id:
        return values_by_feature_id

    specs = snapshot.get("specs")
    if not isinstance(specs, dict):
        return values_by_feature_id

    features = db.session.execute(
        select(Feature).where(Feature.category_id == asset.category_id)
    ).scalars().all()
    features_by_name = {feature.feature_name.casefold(): feature for feature in features}
    features_by_id = {str(feature.feature_id): feature for feature in features}

    for raw_key, value in specs.items():
        feature = features_by_id.get(str(raw_key)) or features_by_name.get(str(raw_key).casefold())
        if feature and value not in (None, ""):
            values_by_feature_id[feature.feature_id] = value

    return values_by_feature_id


def _restore_asset_specs(asset: Asset, snapshot: dict) -> None:
    values_by_feature_id = _asset_specs_from_snapshot(asset, snapshot)
    existing_specs = db.session.execute(
        select(AssetSpec).where(AssetSpec.asset_id == asset.asset_id)
    ).scalars().all()
    specs_by_feature_id = {spec.feature_id: spec for spec in existing_specs}

    for feature_id, value in values_by_feature_id.items():
        if not db.session.get(Feature, feature_id):
            continue
        spec = specs_by_feature_id.get(feature_id)
        if spec:
            spec.content = value
            spec.is_active = True
        else:
            db.session.add(AssetSpec(asset_id=asset.asset_id, feature_id=feature_id, content=value, is_active=True))

    for spec in existing_specs:
        if spec.feature_id not in values_by_feature_id:
            spec.is_active = False


def _rollback_asset(log: AuditLog, actor_id: int | None) -> dict:
    asset = db.session.get(Asset, log.record_id)
    if not asset:
        raise ValueError("Ativo não encontrado na base de dados.")

    action = str(log.action or "").upper()
    old_current = _asset_snapshot_dict(asset)

    if action == "INSERT":
        asset.is_active = False
        for spec in db.session.execute(select(AssetSpec).where(AssetSpec.asset_id == asset.asset_id)).scalars().all():
            spec.is_active = False
        new_value = {**old_current, "is_active": False}
        log_action(
            action="DELETE",
            table_name="assets",
            record_id=asset.asset_id,
            user_id=actor_id,
            origin=_rollback_origin(log),
            old_value=old_current,
            new_value=new_value,
        )
        return new_value

    snapshot = log.old_value or {}
    if not _has_complete_asset_snapshot(snapshot):
        snapshot = _merge_partial_asset_snapshot(old_current, snapshot)

    _apply_asset_snapshot(asset, snapshot)
    _restore_asset_specs(asset, snapshot)
    db.session.flush()
    restored = _asset_snapshot_dict(asset)
    log_action(
        action="UPDATE",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=actor_id,
        origin=_rollback_origin(log),
        old_value=old_current,
        new_value=restored,
    )
    return restored


def _category_snapshot_dict(category: Category) -> dict:
    from app.services.inventory_service import category_to_dict

    return category_to_dict(category, include_features=True)


def _apply_feature_snapshot(feature: Feature, snapshot: dict, category_id: int | None = None) -> None:
    name = _clean(snapshot.get("feature_name") or snapshot.get("name"))
    feature_type = _clean(snapshot.get("feature_type") or snapshot.get("type") or "text").lower()
    if not name:
        raise ValueError("O registo antigo da feature está incompleto.")
    feature.feature_name = name
    feature.feature_type = feature_type if feature_type in {"text", "number", "boolean", "date"} else "text"
    if category_id is not None:
        feature.category_id = category_id
    elif snapshot.get("category_id") is not None:
        feature.category_id = int(snapshot.get("category_id"))
    feature.is_multiple = _to_bool(snapshot.get("is_multiple", snapshot.get("is_repeatable")), False)
    feature.is_active = _to_bool(snapshot.get("is_active"), True)


def _restore_category_features(category_id: int, snapshot: dict) -> None:
    features = snapshot.get("features")
    if not isinstance(features, list):
        return

    existing = db.session.execute(
        select(Feature).where(Feature.category_id == category_id)
    ).scalars().all()
    by_id = {feature.feature_id: feature for feature in existing}
    touched: set[int] = set()

    for raw_feature in features:
        if not isinstance(raw_feature, dict):
            continue
        feature_id = _to_int(raw_feature.get("feature_id"))
        feature = by_id.get(feature_id) if feature_id else None
        if not feature:
            name = _clean(raw_feature.get("feature_name") or raw_feature.get("name"))
            if not name:
                continue
            feature = db.session.execute(
                select(Feature).where(Feature.category_id == category_id, func.lower(Feature.feature_name) == name.lower())
            ).scalar_one_or_none()
        if not feature:
            name = _clean(raw_feature.get("feature_name") or raw_feature.get("name"))
            feature_type = _clean(raw_feature.get("feature_type") or raw_feature.get("type") or "text").lower()
            feature = Feature(
                category_id=category_id,
                feature_name=name,
                feature_type=feature_type if feature_type in {"text", "number", "boolean", "date"} else "text",
                is_multiple=_to_bool(raw_feature.get("is_multiple", raw_feature.get("is_repeatable")), False),
                is_active=_to_bool(raw_feature.get("is_active"), True),
            )
            db.session.add(feature)
            db.session.flush()
        _apply_feature_snapshot(feature, raw_feature, category_id=category_id)
        touched.add(feature.feature_id)

    for feature in existing:
        if feature.feature_id not in touched:
            feature.is_active = False


def _rollback_category(log: AuditLog, actor_id: int | None) -> dict:
    category = db.session.get(Category, log.record_id)
    if not category:
        raise ValueError("Categoria não encontrada na base de dados.")

    action = str(log.action or "").upper()
    old_current = _category_snapshot_dict(category)

    if action == "INSERT":
        active_asset = db.session.execute(
            select(Asset.asset_id).where(Asset.category_id == category.category_id, Asset.is_active == True).limit(1)
        ).scalar_one_or_none()
        if active_asset:
            raise ValueError("Não é possível reverter a criação: existem ativos ativos nesta categoria.")
        category.is_active = False
        for feature in db.session.execute(select(Feature).where(Feature.category_id == category.category_id)).scalars().all():
            feature.is_active = False
        new_value = _category_snapshot_dict(category)
        log_action("DELETE", "categories", category.category_id, actor_id, _rollback_origin(log), old_current, new_value)
        return new_value

    snapshot = log.old_value or {}
    name = _clean(snapshot.get("category_name") or snapshot.get("name"))
    if not name:
        raise ValueError("O registo antigo da categoria está incompleto.")
    conflict = db.session.execute(
        select(Category.category_id).where(Category.category_name == name, Category.category_id != category.category_id).limit(1)
    ).scalar_one_or_none()
    if conflict:
        raise ValueError("Não foi possível restaurar: já existe outra categoria com o mesmo nome.")
    category.category_name = name
    category.is_active = _to_bool(snapshot.get("is_active"), True)
    _restore_category_features(category.category_id, snapshot)
    db.session.flush()
    new_value = _category_snapshot_dict(category)
    log_action("UPDATE", "categories", category.category_id, actor_id, _rollback_origin(log), old_current, new_value)
    return new_value


def _feature_snapshot_dict(feature: Feature) -> dict:
    from app.services.inventory_service import feature_to_dict

    return feature_to_dict(feature)


def _rollback_feature(log: AuditLog, actor_id: int | None) -> dict:
    feature = db.session.get(Feature, log.record_id)
    if not feature:
        raise ValueError("Feature não encontrada na base de dados.")

    action = str(log.action or "").upper()
    old_current = _feature_snapshot_dict(feature)

    if action == "INSERT":
        feature.is_active = False
        new_value = _feature_snapshot_dict(feature)
        log_action("DELETE", "features", feature.feature_id, actor_id, _rollback_origin(log), old_current, new_value)
        return new_value

    snapshot = log.old_value or {}
    _apply_feature_snapshot(feature, snapshot)
    db.session.flush()
    new_value = _feature_snapshot_dict(feature)
    log_action("UPDATE", "features", feature.feature_id, actor_id, _rollback_origin(log), old_current, new_value)
    return new_value


def _location_snapshot_dict(location: Location) -> dict:
    from app.services.location_service import location_to_dict

    return location_to_dict(location)


def _apply_location_snapshot(location: Location, snapshot: dict) -> None:
    name = _clean(snapshot.get("location_name") or snapshot.get("name"))
    if not name:
        raise ValueError("O registo antigo do local está incompleto.")
    conflict = db.session.execute(
        select(Location.location_id).where(Location.location_name == name, Location.location_id != location.location_id).limit(1)
    ).scalar_one_or_none()
    if conflict:
        raise ValueError("Não foi possível restaurar: já existe outro local com o mesmo nome.")
    location.location_name = name
    location.location_manager_id = _to_int(snapshot.get("location_manager_id") or snapshot.get("manager_id"))
    location.is_active = _to_bool(snapshot.get("is_active"), True)


def _rollback_location(log: AuditLog, actor_id: int | None) -> dict:
    location = db.session.get(Location, log.record_id)
    if not location:
        raise ValueError("Local não encontrado na base de dados.")

    action = str(log.action or "").upper()
    old_current = _location_snapshot_dict(location)

    if action == "INSERT":
        active_asset = db.session.execute(
            select(Asset.asset_id).where(Asset.location_id == location.location_id, Asset.is_active == True).limit(1)
        ).scalar_one_or_none()
        if active_asset:
            raise ValueError("Não é possível reverter a criação: existem ativos ativos neste local.")
        location.is_active = False
        new_value = _location_snapshot_dict(location)
        log_action("DELETE", "locations", location.location_id, actor_id, _rollback_origin(log), old_current, new_value)
        return new_value

    snapshot = log.old_value or {}
    _apply_location_snapshot(location, snapshot)
    db.session.flush()
    new_value = _location_snapshot_dict(location)
    log_action("UPDATE", "locations", location.location_id, actor_id, _rollback_origin(log), old_current, new_value)
    return new_value



def _asset_spec_snapshot_dict(spec: AssetSpec) -> dict:
    return {
        "spec_id": spec.spec_id,
        "feature_id": spec.feature_id,
        "asset_id": spec.asset_id,
        "content": spec.content,
        "spec_value": spec.content,
        "is_active": spec.is_active,
    }


def _apply_asset_spec_snapshot(spec: AssetSpec, snapshot: dict) -> None:
    feature_id = _to_int(snapshot.get("feature_id"))
    asset_id = _to_int(snapshot.get("asset_id"))
    if not feature_id or not asset_id:
        raise ValueError("O registo antigo da spec está incompleto.")

    asset = db.session.get(Asset, asset_id)
    if not asset:
        raise ValueError("Não foi possível restaurar: o ativo associado já não existe.")

    feature = db.session.get(Feature, feature_id)
    if not feature:
        raise ValueError("Não foi possível restaurar: a feature associada já não existe.")

    spec.asset_id = asset_id
    spec.feature_id = feature_id
    spec.content = snapshot.get("content", snapshot.get("spec_value"))
    spec.is_active = _to_bool(snapshot.get("is_active"), True)


def _rollback_asset_spec(log: AuditLog, actor_id: int | None) -> dict:
    spec = db.session.get(AssetSpec, log.record_id)
    if not spec:
        raise ValueError("Spec não encontrada na base de dados.")

    action = str(log.action or "").upper()
    old_current = _asset_spec_snapshot_dict(spec)

    if action == "INSERT":
        spec.is_active = False
        new_value = _asset_spec_snapshot_dict(spec)
        log_action(
            action="DELETE",
            table_name="asset_specs",
            record_id=spec.spec_id,
            user_id=actor_id,
            origin=_rollback_origin(log),
            old_value=old_current,
            new_value=new_value,
        )
        return new_value

    snapshot = log.old_value or {}
    _apply_asset_spec_snapshot(spec, snapshot)
    db.session.flush()
    new_value = _asset_spec_snapshot_dict(spec)
    log_action(
        action="UPDATE",
        table_name="asset_specs",
        record_id=spec.spec_id,
        user_id=actor_id,
        origin=_rollback_origin(log),
        old_value=old_current,
        new_value=new_value,
    )
    return new_value
