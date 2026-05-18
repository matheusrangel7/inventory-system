from app.extensions import db
from app.models.audit_log import AuditLog

def log_action(
    action: str,
    table_name: str,
    record_id: int, 
    user_id: int = None,
    origin: str = "utilizador",
    old_value: dict = None,
    new_value: dict = None,
):
    entry = AuditLog(
        action=action,
        table_name=table_name,
        record_id=record_id,
        user_id=user_id,
        origin=origin,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.add(entry)