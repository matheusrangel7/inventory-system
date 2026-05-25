from sqlalchemy import select

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.user import User


def get_all_logs(limit: int = 200) -> list[dict]:
    query = (
        select(AuditLog, User.email)
        .outerjoin(User, User.user_id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )

    rows = db.session.execute(query).all()
    return [log_to_dict(log, email) for log, email in rows]


def log_to_dict(log: AuditLog, email: str | None = None) -> dict:
    return {
        "log_id": log.log_id,
        "user_id": log.user_id,
        "user_email": email or "Sistema",
        "origin": log.origin,
        "action": log.action,
        "table_name": log.table_name,
        "record_id": log.record_id,
        "old_value": log.old_value,
        "new_value": log.new_value,
        "details": build_details(log),
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def build_details(log: AuditLog) -> str:
    action = log.action or "AÇÃO"
    table = log.table_name or "registo"
    return f"{action} em {table} #{log.record_id}"
