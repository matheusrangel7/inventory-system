from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    origin: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="utilizador",
    )
    action: Mapped[str] = mapped_column(
        Enum("INSERT", "UPDATE", "DELETE", name="audit_action_enum"),
        nullable=False,
    )
    table_name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    record_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    old_value: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
    )
    new_value: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
