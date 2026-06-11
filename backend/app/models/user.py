from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.domain.enums import RegistrationStatus, UserRole
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum(*(role.value for role in UserRole), name="user_role_enum"),
        nullable=False,
        default=UserRole.MANAGER,
    )
    registration_status: Mapped[str] = mapped_column(
        Enum(
            *(status.value for status in RegistrationStatus),
            name="registration_status_enum",
        ),
        nullable=False,
        default=RegistrationStatus.PENDING,
    )
    registration_token_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )
    registration_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    totp_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_recovery_code_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"
