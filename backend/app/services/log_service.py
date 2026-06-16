from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import select

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.inventory import Asset, AssetSpec, Category, Feature
from app.models.location import Location
from app.models.user import User
from app.services import inventory_service, rollback_service
from app.utils.audit import log_action

ROLLBACK_ORIGIN = "rollback"
ROLLBACK_OF_LOG_ID_KEY = "_rollback_of_log_id"
ROLLBACK_OF_ACTION_KEY = "_rollback_of_action"
ROLLBACK_OF_CREATED_AT_KEY = "_rollback_of_created_at"
MANAGER_VISIBLE_TABLES = {"assets"}
ADMIN_STRUCTURAL_ROLLBACKABLE_TABLES = {"locations", "categories", "features", "asset_specs", "specs"}
ADMIN_ROLLBACKABLE_TABLES = ADMIN_STRUCTURAL_ROLLBACKABLE_TABLES | {"users"}
USER_SECURITY_TABLES = {
    "users",
    "registration_tokens",
    "password_reset_tokens",
    "sessions",
    "user_sessions",
    "mfa",
    "mfa_recovery",
    "mfa_reconfiguration",
}
_PERMISSION_ERROR_MARKERS = (
    "acesso",
    "autorizado",
    "autorizada",
    "permissão",
    "permissao",
    "fora das salas",
    "fora da tua atribuição",
)


def get_all_logs(limit: int = 200) -> list[dict]:
    """Lista global de logs.

    Mantém o comportamento existente para administradores e apenas acrescenta
    metadados compatíveis com a UI nova, como can_rollback/labels.
    """
    query = (
        select(AuditLog, User.email)
        .outerjoin(User, User.user_id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )

    rows = db.session.execute(query).all()
    return [log_to_dict(log, email) for log, email in rows]


def get_log_by_id(log_id: int) -> dict | None:
    row = db.session.execute(
        select(AuditLog, User.email)
        .outerjoin(User, User.user_id == AuditLog.user_id)
        .where(AuditLog.log_id == log_id)
    ).first()

    if not row:
        return None

    log, email = row
    return log_to_dict(log, email)


def get_manager_asset_logs(manager_id: int, limit: int = 200) -> list[dict]:
    """Logs visíveis para gestor.

    O gestor só vê alterações de ativos que pertencem às salas atribuídas a ele.
    A listagem não devolve snapshots old_value/new_value para reduzir exposição
    de dados na tabela; o detalhe devolve apenas se o registo continuar dentro
    do scope do gestor.
    """
    rows = db.session.execute(
        _manager_asset_logs_query(manager_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()

    return [
        log_to_dict(
            log,
            email,
            asset=asset,
            category_name=category_name,
            location_name=location_name,
            include_values=False,
            role="Gestor",
        )
        for log, email, asset, category_name, location_name in rows
    ]


def get_manager_asset_log_by_id(log_id: int, manager_id: int) -> dict | None:
    row = db.session.execute(
        _manager_asset_logs_query(manager_id).where(AuditLog.log_id == log_id)
    ).first()

    if not row:
        return None

    log, email, asset, category_name, location_name = row
    return log_to_dict(
        log,
        email,
        asset=asset,
        category_name=category_name,
        location_name=location_name,
        include_values=True,
        role="Gestor",
    )


def rollback_log(log_id: int, user_id: int | None, role: str | None) -> tuple[bool, str, dict | None]:
    """Executa rollback de registos suportados, com permissões por role.

    Administrador: pode reverter entidades estruturais do inventário
    (locais, categorias, features e specs) e, de forma excecional, a
    remoção/desativação de contas de gestor. Outras ações sobre utilizadores,
    autenticação e ciclo de registo ficam explicitamente bloqueadas.

    Gestor: mantém o requisito funcional anterior e só pode reverter UPDATE/DELETE
    de ativos pertencentes às salas atribuídas; criação de ativos não é revertível.
    """
    if not user_id:
        return False, "Utilizador inválido.", None

    log = db.session.get(AuditLog, log_id)
    if not log:
        return False, "Registo não encontrado.", None

    if _is_rollback_origin(log.origin):
        return False, "Este registo já é resultado de um rollback e não pode ser revertido novamente.", None

    if role not in {"Administrador", "Gestor"}:
        return False, "Acesso não autorizado.", None

    if _is_user_security_table(log.table_name) and not _is_user_account_deactivation_log(log):
        return False, "Ações de utilizadores, MFA, palavras-passe ou estado de registo não podem ser revertidas por segurança.", None

    if role == "Administrador":
        if not _is_admin_rollback_log(log):
            return False, rollback_unavailable_reason(log, role=role), None

        return rollback_service.rollback_log(
            log_id=log_id,
            actor_id=user_id,
            actor_role=role,
        )

    if log.table_name != "assets":
        return False, "Gestores só podem reverter registos de ativos das suas salas.", None

    if log.action == "INSERT":
        return False, "Gestores não podem reverter criação de ativos.", None

    if _log_already_rolled_back(log):
        return False, "Este registo já foi revertido e não pode ser revertido novamente.", None

    asset = db.session.get(Asset, log.record_id)
    if not asset:
        return False, "Ativo do registo não encontrado.", None

    if not _asset_belongs_to_manager(asset, user_id):
        return False, "Não tem permissão para reverter ativos fora das salas atribuídas.", None

    if log.action == "UPDATE":
        return _rollback_asset_update(log, asset, user_id, role)
    if log.action == "DELETE":
        return _rollback_asset_delete(log, asset, user_id, role)

    return False, "Tipo de ação inválido para rollback.", None

def log_to_dict(
    log: AuditLog,
    email: str | None = None,
    *,
    asset: Asset | None = None,
    category_name: str | None = None,
    location_name: str | None = None,
    include_values: bool = True,
    role: str = "Administrador",
) -> dict:
    """Serializa um AuditLog para a API sem quebrar o contrato antigo."""
    old_value = log.old_value
    new_value = log.new_value
    reference = _reference_value(log, asset, category_name, location_name)
    rollback_consumed = _rollback_consumed(log, role)
    rollback_available = can_rollback(log, role=role, already_rolled_back=rollback_consumed)

    data = {
        "log_id": log.log_id,
        "user_id": log.user_id,
        "user_email": email or "Sistema",
        "origin": log.origin,
        "origin_label": _origin_label(log.origin),
        "action": log.action,
        "action_label": _action_label(log.action),
        "table_name": log.table_name,
        "table_label": _table_label(log.table_name),
        "record_id": log.record_id,
        "record_label": reference["record_label"],
        "details": build_details(log, reference),
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "can_rollback": rollback_available,
        "rollback_available": rollback_available,
        "rollback_consumed": rollback_consumed,
        "rollback_label": rollback_label(log),
        "rollback_reason": rollback_unavailable_reason(
            log,
            role=role,
            already_rolled_back=rollback_consumed,
        ),
    }

    if include_values:
        data["old_value"] = old_value
        data["new_value"] = new_value
        data["old_value_display"] = audit_items(old_value)
        data["new_value_display"] = audit_items(new_value)
        data["changes"] = audit_changes(old_value, new_value)

    return data


def build_details(log: AuditLog, reference: dict | None = None) -> str:
    if reference is None:
        reference = _reference_value(log)

    if log.table_name == "assets":
        return (
            f"{_action_label(log.action)} do ativo {reference['record_label']} "
            f"({reference['category_label']}, {reference['location_label']})"
        )

    action = log.action or "AÇÃO"
    table = log.table_name or "registo"
    return f"{action} em {table} #{log.record_id}"


def can_rollback(
    log: AuditLog,
    role: str | None = "Administrador",
    *,
    already_rolled_back: bool | None = None,
) -> bool:
    if _is_rollback_origin(log.origin):
        return False

    if already_rolled_back is None:
        already_rolled_back = _rollback_consumed(log, role)
    if already_rolled_back:
        return False

    if _is_user_security_table(log.table_name) and not _is_user_account_deactivation_log(log):
        return False

    if role == "Administrador":
        if not _is_admin_rollback_log(log):
            return False
        ok, _ = rollback_service.is_rollbackable(log, actor_role=role)
        return ok

    if role == "Gestor":
        if log.table_name != "assets":
            return False
        if log.action == "INSERT":
            return False
        return log.action in {"UPDATE", "DELETE"} and bool(log.old_value)

    return False


def rollback_label(log: AuditLog) -> str:
    entity = _rollback_entity_label(log.table_name)
    return {
        "INSERT": f"Reverter criação de {entity}",
        "UPDATE": f"Reverter alteração de {entity}",
        "DELETE": f"Reverter remoção de {entity}",
    }.get(log.action or "", "Reverter registo")


def rollback_unavailable_reason(
    log: AuditLog,
    role: str | None = "Administrador",
    *,
    already_rolled_back: bool | None = None,
) -> str:
    if _is_rollback_origin(log.origin):
        return "Este registo foi criado por uma reversão e não pode ser revertido novamente."
    if _is_user_security_table(log.table_name) and not _is_user_account_deactivation_log(log):
        return "Ações de utilizadores, MFA, palavras-passe ou estado de registo não podem ser revertidas por segurança."
    if already_rolled_back is None:
        already_rolled_back = _rollback_consumed(log, role)
    if already_rolled_back:
        return "Este registo já foi revertido."

    if role == "Administrador":
        if not _is_admin_rollback_log(log):
            return "Rollback disponível apenas para Locais, Categorias, Features, Specs e remoção/desativação de contas."
        ok, reason = rollback_service.is_rollbackable(log, actor_role=role)
        return reason if not ok else "Rollback disponível."

    if role == "Gestor":
        if log.table_name != "assets":
            return "Gestores só podem reverter registos de ativos das suas salas."
        if log.action == "INSERT":
            return "Gestores não podem reverter criação de ativos."
        if log.action == "UPDATE" and not log.old_value:
            return "Sem valor anterior para reverter."
        if log.action == "DELETE" and not log.old_value:
            return "Sem valor anterior para restaurar."

    return "Rollback indisponível para este registo."


def is_permission_error(message: str | None) -> bool:
    normalized = _clean_text(message).casefold()
    return any(marker in normalized for marker in _PERMISSION_ERROR_MARKERS)


def audit_items(value: Any) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, dict):
        return [{"label": "Valor", "value": _format_audit_value(value)}]

    items: list[dict] = []
    for key, item in value.items():
        if _is_audit_key_hidden(key):
            continue
        if key == "specs" and isinstance(item, dict):
            for spec_name, spec_value in item.items():
                items.append({
                    "label": f"Característica · {spec_name}",
                    "value": _format_audit_value(spec_value),
                })
            continue
        if key == "specs_details":
            continue
        items.append({"label": _humanize_audit_key(key), "value": _format_audit_value(item)})
    return items


def audit_changes(old_value: Any, new_value: Any) -> list[dict]:
    if not isinstance(old_value, dict) or not isinstance(new_value, dict):
        return []

    keys = sorted(set(old_value.keys()) | set(new_value.keys()))
    changes: list[dict] = []
    for key in keys:
        if _is_audit_key_hidden(key):
            continue
        old_item = old_value.get(key)
        new_item = new_value.get(key)
        if old_item == new_item:
            continue

        if key == "specs" and isinstance(old_item, dict) and isinstance(new_item, dict):
            spec_keys = sorted(set(old_item.keys()) | set(new_item.keys()))
            for spec_key in spec_keys:
                old_spec = old_item.get(spec_key)
                new_spec = new_item.get(spec_key)
                if old_spec == new_spec:
                    continue
                changes.append({
                    "label": f"Característica · {spec_key}",
                    "old": _format_audit_value(old_spec),
                    "new": _format_audit_value(new_spec),
                })
            continue

        if key == "specs_details":
            continue
        changes.append({
            "label": _humanize_audit_key(key),
            "old": _format_audit_value(old_item),
            "new": _format_audit_value(new_item),
        })
    return changes


def _is_rollback_origin(origin: str | None) -> bool:
    normalized = str(origin or "").strip().lower()
    return normalized == ROLLBACK_ORIGIN or normalized.startswith(f"{ROLLBACK_ORIGIN}:")


def _normalized_table_name(table_name: str | None) -> str:
    return str(table_name or "").strip().lower()


def _is_admin_rollback_table(table_name: str | None) -> bool:
    return _normalized_table_name(table_name) in ADMIN_ROLLBACKABLE_TABLES


def _is_admin_rollback_log(log: AuditLog | None) -> bool:
    if not log:
        return False
    if _normalized_table_name(log.table_name) in ADMIN_STRUCTURAL_ROLLBACKABLE_TABLES:
        return True
    return _is_user_account_deactivation_log(log)


def _snapshot_bool(snapshot: Any, key: str, default: bool | None = None) -> bool | None:
    if not isinstance(snapshot, dict) or key not in snapshot:
        return default
    value = snapshot.get(key)
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    return str(value).strip().lower() in {"1", "true", "sim", "yes", "on", "ativo", "ativa"}


def _is_user_account_deactivation_log(log: AuditLog | None) -> bool:
    if not log:
        return False
    if _normalized_table_name(log.table_name) != "users":
        return False
    if str(log.action or "").upper() != "DELETE":
        return False
    return (
        _snapshot_bool(log.old_value, "is_active") is True
        and _snapshot_bool(log.new_value, "is_active") is False
    )


def _is_user_security_table(table_name: str | None) -> bool:
    normalized = _normalized_table_name(table_name)
    return (
        normalized in USER_SECURITY_TABLES
        or normalized.startswith("mfa")
        or "password" in normalized
        or "registration" in normalized
        or "session" in normalized
        or normalized.startswith("user")
    )


def _rollback_consumed(log: AuditLog, role: str | None) -> bool:
    if role == "Administrador" and _is_admin_rollback_log(log):
        return rollback_service.has_already_been_rolled_back(log.log_id)
    if role == "Gestor" and _should_check_rollback_consumed(log, role):
        return _log_already_rolled_back(log)
    return False


def _should_check_rollback_consumed(log: AuditLog, role: str | None) -> bool:
    if log.table_name != "assets":
        return False
    if _is_rollback_origin(log.origin):
        return False
    if log.action == "INSERT":
        return role == "Administrador" and bool(log.new_value)
    if log.action in {"UPDATE", "DELETE"}:
        return bool(log.old_value)
    return False


def _rollback_action_for(action: str | None) -> str | None:
    return {
        "INSERT": "DELETE",
        "UPDATE": "UPDATE",
        "DELETE": "INSERT",
    }.get(action or "")


def _log_already_rolled_back(log: AuditLog) -> bool:
    """Indica se o registo original já foi consumido por um rollback.

    O modelo não tem uma FK dedicada entre a ação original e a ação de rollback.
    Para manter compatibilidade sem migração, os novos rollbacks gravam metadados
    em JSONB. Para rollbacks já existentes, há um fallback conservador baseado no
    mesmo ativo/ação/timestamp e numa comparação mínima do snapshot.
    """
    if not log or not log.log_id:
        return False

    rollback_action = _rollback_action_for(log.action)
    if not rollback_action:
        return False

    query = select(AuditLog).where(
        AuditLog.table_name == log.table_name,
        AuditLog.record_id == log.record_id,
        AuditLog.origin == ROLLBACK_ORIGIN,
        AuditLog.action == rollback_action,
    )
    if log.created_at:
        query = query.where(AuditLog.created_at >= log.created_at)

    rollback_logs = db.session.execute(
        query.order_by(AuditLog.created_at.desc()).limit(100)
    ).scalars().all()

    for rollback_log in rollback_logs:
        if _rollback_log_has_source_marker(rollback_log, log.log_id):
            return True

    return any(_rollback_log_matches_legacy_source(rollback_log, log) for rollback_log in rollback_logs)


def _rollback_log_has_source_marker(rollback_log: AuditLog, source_log_id: int) -> bool:
    for snapshot in (rollback_log.old_value, rollback_log.new_value):
        if isinstance(snapshot, dict) and _to_int(snapshot.get(ROLLBACK_OF_LOG_ID_KEY)) == source_log_id:
            return True
    return False


def _rollback_log_matches_legacy_source(rollback_log: AuditLog, source_log: AuditLog) -> bool:
    if not rollback_log.created_at or not source_log.created_at:
        return False
    if rollback_log.created_at < source_log.created_at:
        return False

    source_snapshot = source_log.old_value if source_log.action in {"UPDATE", "DELETE"} else source_log.new_value
    restored_snapshot = rollback_log.new_value if source_log.action in {"UPDATE", "DELETE"} else rollback_log.old_value
    return _snapshots_reference_same_asset(source_snapshot, restored_snapshot)


def _snapshots_reference_same_asset(left: Any, right: Any) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False

    comparable_keys = (
        "asset_id",
        "serial_number",
        "category_id",
        "location_id",
        "asset_state",
        "status",
        "assigned_to",
    )
    comparable_values = 0

    for key in comparable_keys:
        left_value = left.get(key)
        right_value = right.get(key)
        if left_value in (None, "") or right_value in (None, ""):
            continue
        comparable_values += 1
        if str(left_value) != str(right_value):
            return False

    return comparable_values >= 2


def _with_rollback_metadata(value: Any, source_log: AuditLog) -> dict:
    snapshot = dict(value or {}) if isinstance(value, dict) else {"value": value}
    snapshot[ROLLBACK_OF_LOG_ID_KEY] = source_log.log_id
    snapshot[ROLLBACK_OF_ACTION_KEY] = source_log.action
    snapshot[ROLLBACK_OF_CREATED_AT_KEY] = source_log.created_at.isoformat() if source_log.created_at else None
    return snapshot


def _manager_asset_logs_query(manager_id: int):
    return (
        select(AuditLog, User.email, Asset, Category.category_name, Location.location_name)
        .outerjoin(User, User.user_id == AuditLog.user_id)
        .join(Asset, Asset.asset_id == AuditLog.record_id)
        .join(Category, Category.category_id == Asset.category_id)
        .join(Location, Location.location_id == Asset.location_id)
        .where(
            AuditLog.table_name.in_(MANAGER_VISIBLE_TABLES),
            Location.location_manager_id == manager_id,
        )
    )


def _rollback_asset_insert(log: AuditLog, asset: Asset, user_id: int) -> tuple[bool, str, dict | None]:
    if not asset.is_active:
        return False, "O ativo já se encontra removido.", None

    before = inventory_service.asset_to_dict(asset)
    asset.is_active = False
    for spec in _asset_specs(asset.asset_id):
        spec.is_active = False

    db.session.flush()
    after = {**inventory_service.asset_to_dict(asset), "is_active": False}

    log_action(
        action="DELETE",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=user_id,
        origin=ROLLBACK_ORIGIN,
        old_value=_with_rollback_metadata(before, log),
        new_value=_with_rollback_metadata(after, log),
    )
    db.session.commit()
    return True, "Criação do ativo revertida com sucesso.", after


def _rollback_asset_update(
    log: AuditLog,
    asset: Asset,
    user_id: int,
    role: str | None,
) -> tuple[bool, str, dict | None]:
    snapshot = log.old_value or {}
    if not snapshot:
        return False, "O registo não tem dados anteriores para repor.", None

    return _apply_asset_snapshot(
        asset=asset,
        snapshot=snapshot,
        user_id=user_id,
        role=role,
        source_log=log,
        success_message="Alteração do ativo revertida com sucesso.",
        rollback_action="UPDATE",
    )


def _rollback_asset_delete(
    log: AuditLog,
    asset: Asset,
    user_id: int,
    role: str | None,
) -> tuple[bool, str, dict | None]:
    snapshot = dict(log.old_value or {})
    if not snapshot:
        return False, "O registo não tem dados anteriores para restaurar.", None

    snapshot["is_active"] = True
    return _apply_asset_snapshot(
        asset=asset,
        snapshot=snapshot,
        user_id=user_id,
        role=role,
        source_log=log,
        success_message="Remoção do ativo revertida com sucesso.",
        rollback_action="INSERT",
    )


def _apply_asset_snapshot(
    asset: Asset,
    snapshot: dict,
    user_id: int,
    role: str | None,
    source_log: AuditLog,
    success_message: str,
    rollback_action: str,
) -> tuple[bool, str, dict | None]:
    before = inventory_service.asset_to_dict(asset)

    target_category_id = _to_int(snapshot.get("category_id")) or asset.category_id
    target_location_id = _to_int(snapshot.get("location_id")) or asset.location_id

    if role == "Gestor" and not _location_belongs_to_manager(target_location_id, user_id):
        return False, "O rollback iria mover/restaurar o ativo para uma sala fora da tua atribuição.", None

    category = db.session.get(Category, target_category_id)
    if not category or not category.is_active:
        return False, "Categoria do snapshot já não existe ou está inativa.", None

    location = db.session.get(Location, target_location_id)
    if not location or not location.is_active:
        return False, "Sala/local do snapshot já não existe ou está inativo.", None

    target_serial = _clean_text(snapshot.get("serial_number")) or asset.serial_number
    duplicate = db.session.execute(
        select(Asset).where(Asset.serial_number == target_serial, Asset.asset_id != asset.asset_id)
    ).scalar_one_or_none()
    if duplicate:
        return False, "Não foi possível reverter: já existe outro ativo com o mesmo número de série.", None

    assigned_to = _nullable_text(snapshot.get("assigned_to"))

    asset.serial_number = target_serial
    asset.category_id = target_category_id
    asset.location_id = target_location_id
    asset.asset_state = _clean_text(snapshot.get("asset_state") or snapshot.get("status") or asset.asset_state)
    asset.assigned_to = assigned_to
    asset.assigned_at = _parse_datetime(snapshot.get("assigned_at")) if assigned_to else None
    asset.last_maintenance = _parse_date(snapshot.get("last_maintenance"))
    asset.maintenance_period_months = _to_int(snapshot.get("maintenance_period_months"))
    asset.is_active = bool(snapshot.get("is_active", True))

    _replace_asset_specs(asset.asset_id, target_category_id, snapshot.get("specs") or {})

    db.session.flush()
    after = inventory_service.asset_to_dict(asset, category.category_name, location.location_name)

    log_action(
        action=rollback_action if rollback_action in {"INSERT", "UPDATE", "DELETE"} else "UPDATE",
        table_name="assets",
        record_id=asset.asset_id,
        user_id=user_id,
        origin=ROLLBACK_ORIGIN,
        old_value=_with_rollback_metadata(before, source_log),
        new_value=_with_rollback_metadata(after, source_log),
    )
    db.session.commit()
    return True, success_message, after


def _replace_asset_specs(asset_id: int, category_id: int, specs: dict[str, Any]) -> None:
    existing_specs = _asset_specs(asset_id)
    existing_by_feature_id = {spec.feature_id: spec for spec in existing_specs}

    for spec in existing_specs:
        spec.is_active = False

    if not specs:
        return

    features = db.session.execute(
        select(Feature).where(Feature.category_id == category_id, Feature.is_active == True)
    ).scalars().all()
    features_by_name = {feature.feature_name: feature for feature in features}
    features_by_id = {str(feature.feature_id): feature for feature in features}

    for raw_key, value in specs.items():
        feature = features_by_id.get(str(raw_key)) or features_by_name.get(str(raw_key))
        if not feature:
            continue

        spec = existing_by_feature_id.get(feature.feature_id)
        if spec:
            spec.content = value
            spec.is_active = True
        else:
            db.session.add(
                AssetSpec(
                    asset_id=asset_id,
                    feature_id=feature.feature_id,
                    content=value,
                    is_active=True,
                )
            )


def _asset_specs(asset_id: int) -> list[AssetSpec]:
    return db.session.execute(select(AssetSpec).where(AssetSpec.asset_id == asset_id)).scalars().all()


def _asset_belongs_to_manager(asset: Asset, manager_id: int) -> bool:
    return _location_belongs_to_manager(asset.location_id, manager_id)


def _location_belongs_to_manager(location_id: int | None, manager_id: int) -> bool:
    if not location_id:
        return False
    location = db.session.get(Location, location_id)
    return bool(location and location.is_active and location.location_manager_id == manager_id)


def _reference_value(
    log: AuditLog,
    asset: Asset | None = None,
    category_name: str | None = None,
    location_name: str | None = None,
) -> dict:
    raw = log.new_value or log.old_value or {}

    record_label = (
        _first_present(raw, "serial_number", "codigo", "code")
        or (asset.serial_number if asset else None)
        or f"#{log.record_id}"
    )
    category_label = _first_present(raw, "category_name", "category") or category_name or "categoria N/A"
    location_label = _first_present(raw, "location_name", "location") or location_name or "sala N/A"

    return {
        "record_label": record_label,
        "category_label": category_label,
        "location_label": location_label,
    }


def _first_present(source: dict | None, *keys: str) -> Any:
    if not isinstance(source, dict):
        return None
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return value
    return None



def _rollback_entity_label(table_name: str | None) -> str:
    return {
        "locations": "local",
        "categories": "categoria",
        "features": "feature",
        "asset_specs": "spec",
        "specs": "spec",
        "assets": "ativo",
        "users": "conta de utilizador",
    }.get(_normalized_table_name(table_name), "registo")

def _table_label(table_name: str | None) -> str:
    return {
        "assets": "Ativos",
        "asset_specs": "Specs",
        "specs": "Specs",
        "categories": "Categorias",
        "features": "Características",
        "locations": "Locais",
        "users": "Utilizadores",
    }.get(table_name or "", table_name or "Registo")


def _action_label(action: str | None) -> str:
    return {
        "INSERT": "Criação",
        "UPDATE": "Atualização",
        "DELETE": "Remoção",
    }.get(action or "", action or "Ação")


def _origin_label(origin: str | None) -> str:
    if _is_rollback_origin(origin):
        return "Rollback"
    return origin or "Utilizador"


def _humanize_audit_key(key: str) -> str:
    labels = {
        "asset_id": "ID do ativo",
        "asset_state": "Estado",
        "assigned_at": "Data de atribuição",
        "assigned_to": "Atribuído a",
        "category_id": "ID da categoria",
        "category_name": "Categoria",
        "content": "Conteúdo",
        "created_at": "Criado em",
        "feature_id": "ID da característica",
        "feature_name": "Característica",
        "email": "Email",
        "role": "Perfil",
        "registration_status": "Estado de registo",
        "mfa_enabled": "MFA ativo",
        "is_active": "Ativo",
        "last_maintenance": "Última manutenção",
        "location_id": "ID do local",
        "location_ids": "Salas atribuídas",
        "location_name": "Local",
        "maintenance_period_months": "Período de manutenção",
        "registered_at": "Data de registo",
        "serial_number": "Número de série",
        "specs": "Características",
        "status": "Estado",
    }
    return labels.get(key, str(key or "Campo").replace("_", " ").capitalize())


def _is_audit_key_hidden(key: str) -> bool:
    normalized_key = str(key or "")
    if normalized_key.startswith("_rollback_"):
        return True
    return normalized_key in {
        "password",
        "password_hash",
        "registration_token",
        "registration_token_hash",
        "mfa_recovery_code_hash",
        "totp_secret",
    }


def _format_audit_value(value: Any) -> str:
    if value in (None, ""):
        return "-"
    if value is True:
        return "Sim"
    if value is False:
        return "Não"
    if isinstance(value, list):
        return "; ".join(_format_audit_value(item) for item in value) or "-"
    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            if _is_audit_key_hidden(key):
                continue
            parts.append(f"{_humanize_audit_key(key)}: {_format_audit_value(item)}")
        return "; ".join(parts) or "-"
    return str(value)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _nullable_text(value: Any) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned or cleaned == "-" or cleaned.upper() == "N/A":
        return None
    return cleaned


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
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    raw = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None