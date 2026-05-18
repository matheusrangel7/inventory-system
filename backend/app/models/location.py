from typing import Optional
from sqlalchemy import String, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Location(Base):
    __tablename__ = "locations"

    location_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    location_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        unique=True,
    )
    location_manager_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<Location {self.location_name}>"
