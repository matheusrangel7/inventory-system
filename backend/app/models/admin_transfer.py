from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PendingAdminTransfer(Base):
    __tablename__ = "pending_admin_transfer"
    __table_args__ = (
        CheckConstraint(
            "initiated_by <> target_user_id",
            name="ck_pending_admin_transfer_not_self",
        ),
    )

    transfer_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    initiated_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    target_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
