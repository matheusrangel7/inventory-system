from __future__ import annotations

from typing import Any

ROLLBACK_ORIGIN = "rollback"
ROLLBACK_OF_LOG_ID_KEY = "_rollback_of_log_id"
ROLLBACK_OF_ACTION_KEY = "_rollback_of_action"
ROLLBACK_OF_CREATED_AT_KEY = "_rollback_of_created_at"

ROLLBACKABLE_ACTIONS = frozenset({"INSERT", "UPDATE", "DELETE"})
STRUCTURAL_ROLLBACKABLE_TABLES = frozenset(
    {"categories", "features", "locations", "asset_specs", "specs"}
)
ADMIN_ROLLBACKABLE_TABLES = STRUCTURAL_ROLLBACKABLE_TABLES | frozenset({"users"})
MANAGER_ROLLBACKABLE_TABLES = frozenset({"assets"})

USER_SECURITY_TABLES = frozenset(
    {
        "users",
        "registration_tokens",
        "password_reset_tokens",
        "sessions",
        "user_sessions",
        "mfa",
        "mfa_recovery",
        "mfa_reconfiguration",
    }
)


def normalized_role(role: str | None) -> str:
    return str(role or "").strip()


def normalized_action(action: str | None) -> str:
    return str(action or "").strip().upper()


def normalized_table_name(table_name: str | None) -> str:
    return str(table_name or "").strip().lower()


def rollback_origin_for_log_id(log_id: int) -> str:
    return f"{ROLLBACK_ORIGIN}:{int(log_id)}"


def is_rollback_origin(origin: str | None) -> bool:
    normalized = str(origin or "").strip().lower()
    return normalized == ROLLBACK_ORIGIN or normalized.startswith(f"{ROLLBACK_ORIGIN}:")


def snapshot_bool(snapshot: Any, key: str, default: bool | None = None) -> bool | None:
    if not isinstance(snapshot, dict) or key not in snapshot:
        return default

    value = snapshot.get(key)
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default

    return str(value).strip().lower() in {"1", "true", "sim", "yes", "on", "ativo", "ativa"}


def is_user_account_deactivation_log(log: Any | None) -> bool:
    if not log:
        return False
    if normalized_table_name(getattr(log, "table_name", None)) != "users":
        return False
    if normalized_action(getattr(log, "action", None)) != "DELETE":
        return False

    return (
        snapshot_bool(getattr(log, "old_value", None), "is_active") is True
        and snapshot_bool(getattr(log, "new_value", None), "is_active") is False
    )


def is_user_security_table(table_name: str | None) -> bool:
    normalized = normalized_table_name(table_name)
    return (
        normalized in USER_SECURITY_TABLES
        or normalized.startswith("mfa")
        or "password" in normalized
        or "registration" in normalized
        or "session" in normalized
        or normalized.startswith("user")
    )


def is_admin_rollback_table(table_name: str | None) -> bool:
    return normalized_table_name(table_name) in ADMIN_ROLLBACKABLE_TABLES


def is_admin_rollback_log(log: Any | None) -> bool:
    if not log:
        return False

    table_name = normalized_table_name(getattr(log, "table_name", None))
    if table_name in STRUCTURAL_ROLLBACKABLE_TABLES:
        return True

    return is_user_account_deactivation_log(log)


def blocks_user_security_rollback(log: Any | None) -> bool:
    if not log:
        return False
    return (
        is_user_security_table(getattr(log, "table_name", None))
        and not is_user_account_deactivation_log(log)
    )


def rollback_action_for(action: str | None) -> str | None:
    return {
        "INSERT": "DELETE",
        "UPDATE": "UPDATE",
        "DELETE": "INSERT",
    }.get(normalized_action(action))
