from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.user import User


ACTION_LABELS = {
    "INSERT": "Criação",
    "UPDATE": "Atualização",
    "DELETE": "Remoção",
}

TABLE_LABELS = {
    "assets": "Ativos",
    "asset_specs": "Características do ativo",
    "categories": "Categorias",
    "features": "Features",
    "locations": "Locais",
    "users": "Utilizadores",
    "audit_logs": "Registos de auditoria",
}

FIELD_LABELS = {
    "asset_id": "ID do ativo",
    "asset_state": "Estado",
    "asset_count": "N.º de ativos",
    "assigned_at": "Data de atribuição",
    "assigned_to": "Atribuído a",
    "category_id": "ID da categoria",
    "category_name": "Categoria",
    "content": "Conteúdo",
    "created_at": "Criado em",
    "email": "Email",
    "feature_id": "ID da feature",
    "feature_name": "Feature",
    "feature_type": "Tipo",
    "features": "Features",
    "is_active": "Ativo",
    "is_archived_feature": "Feature desativada",
    "is_multiple": "Permite múltiplos valores",
    "is_repeatable": "Permite múltiplos valores",
    "last_maintenance": "Última manutenção",
    "location_id": "ID do local",
    "location_manager_id": "ID do gestor",
    "location_name": "Local",
    "maintenance_period_months": "Período de manutenção",
    "manager_email": "Email do gestor",
    "manager_id": "ID do gestor",
    "name": "Nome",
    "new_value": "Valor novo",
    "old_value": "Valor anterior",
    "registered_at": "Data de registo",
    "registration_status": "Estado do registo",
    "role": "Cargo",
    "serial_number": "Número de série",
    "spec_id": "ID da característica",
    "spec_value": "Valor",
    "specs": "Características",
    "specs_details": "Detalhe das características",
    "status": "Estado",
    "totp_secret": "MFA configurado",
    "user_id": "ID do utilizador",
}

FEATURE_TYPE_LABELS = {
    "text": "Texto",
    "number": "Número",
    "boolean": "Sim/Não",
    "date": "Data",
}

NOISY_KEYS = {
    "specs_details",
}


def get_all_logs(limit: int = 200) -> list[dict]:
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


def log_to_dict(log: AuditLog, email: str | None = None) -> dict:
    old_display = build_display_items(log.old_value)
    new_display = build_display_items(log.new_value)

    return {
        "log_id": log.log_id,
        "user_id": log.user_id,
        "user_email": email or "Sistema",
        "origin": log.origin,
        "action": log.action,
        "action_label": get_action_label(log.action),
        "table_name": log.table_name,
        "table_label": get_table_label(log.table_name),
        "record_id": log.record_id,
        "old_value": log.old_value,
        "new_value": log.new_value,
        "old_value_display": old_display,
        "new_value_display": new_display,
        "changes": build_changes(log.old_value, log.new_value),
        "details": build_details(log),
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def get_action_label(action: str | None) -> str:
    return ACTION_LABELS.get(str(action or "").upper(), action or "Ação")


def get_table_label(table_name: str | None) -> str:
    return TABLE_LABELS.get(str(table_name or ""), table_name or "Registo")


def field_label(key: str) -> str:
    if key in FIELD_LABELS:
        return FIELD_LABELS[key]
    return str(key).replace("_", " ").strip().capitalize()


def format_scalar(value: Any) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, bool):
        return "Sim" if value else "Não"
    return str(value)


def format_value(value: Any) -> str:
    if value is None or value == "":
        return "-"

    if isinstance(value, bool):
        return "Sim" if value else "Não"

    if isinstance(value, list):
        if not value:
            return "-"
        if all(isinstance(item, dict) for item in value):
            return "; ".join(format_dict_summary(item) for item in value)
        return ", ".join(format_value(item) for item in value)

    if isinstance(value, dict):
        return format_dict_summary(value)

    return str(value)


def format_dict_summary(value: dict) -> str:
    if not value:
        return "-"

    if "feature_name" in value:
        feature_type = FEATURE_TYPE_LABELS.get(str(value.get("feature_type") or "").lower(), value.get("feature_type") or "Texto")
        multiple = value.get("is_multiple") or value.get("is_repeatable")
        suffix = " · Múltipla" if multiple else ""
        return f"{value.get('feature_name')} ({feature_type}{suffix})"

    if "feature_id" in value and ("content" in value or "spec_value" in value):
        name = value.get("feature_name") or f"Feature #{value.get('feature_id')}"
        return f"{name}: {format_value(value.get('content', value.get('spec_value')))}"

    useful = []
    for key, item in value.items():
        if key in NOISY_KEYS:
            continue
        useful.append(f"{field_label(key)}: {format_value(item)}")
    return "; ".join(useful) if useful else "-"


def build_display_items(value: Any) -> list[dict]:
    if not value:
        return []

    if not isinstance(value, dict):
        return [{"label": "Valor", "value": format_value(value)}]

    items: list[dict] = []

    for key, item in value.items():
        if key in NOISY_KEYS:
            continue

        if key == "specs" and isinstance(item, dict):
            for spec_name, spec_value in item.items():
                items.append({
                    "label": f"Característica · {spec_name}",
                    "value": format_value(spec_value),
                })
            continue

        if key == "features" and isinstance(item, list):
            items.append({
                "label": "Features da categoria",
                "value": format_value(item),
            })
            continue

        items.append({"label": field_label(key), "value": format_value(item)})

    return items


def comparable_items(value: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    if not isinstance(value, dict):
        return result

    for item in build_display_items(value):
        result[item["label"]] = item["value"]
    return result


def build_changes(old_value: Any, new_value: Any) -> list[dict]:
    old_items = comparable_items(old_value)
    new_items = comparable_items(new_value)
    labels = sorted(set(old_items) | set(new_items), key=str.lower)

    changes = []
    for label in labels:
        old_text = old_items.get(label, "-")
        new_text = new_items.get(label, "-")
        if old_text != new_text:
            changes.append({"label": label, "old": old_text, "new": new_text})
    return changes


def build_details(log: AuditLog) -> str:
    action = get_action_label(log.action)
    table = get_table_label(log.table_name)
    return f"{action} em {table} #{log.record_id}"
