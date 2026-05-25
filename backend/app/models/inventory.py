from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Feature(Base):
    __tablename__ = "features"

    feature_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feature_name: Mapped[str] = mapped_column(String(50), nullable=False)
    feature_type: Mapped[str] = mapped_column(
        Enum("text", "number", "boolean", "date", name="feature_type_enum"),
        nullable=False,
        default="text",
    )
    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("categories.category_id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_multiple: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def is_repeatable(self) -> bool:
        """Alias de compatibilidade com o frontend/código antigo."""
        return bool(self.is_multiple)

    @is_repeatable.setter
    def is_repeatable(self, value: bool) -> None:
        self.is_multiple = bool(value)


class Asset(Base):
    __tablename__ = "assets"

    asset_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("categories.category_id", ondelete="RESTRICT"),
        nullable=False,
    )
    location_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("locations.location_id", ondelete="RESTRICT"),
        nullable=False,
    )
    assigned_to: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    asset_state: Mapped[str] = mapped_column(
        Enum(
            "Bom Estado",
            "Necessita Manutenção",
            "Avariado",
            "Para Abate",
            name="asset_state_enum",
        ),
        nullable=False,
    )
    last_maintenance: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    maintenance_period_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AssetSpec(Base):
    __tablename__ = "asset_specs"

    spec_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feature_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("features.feature_id", ondelete="RESTRICT"),
        nullable=False,
    )
    asset_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assets.asset_id", ondelete="RESTRICT"),
        nullable=False,
    )
    content: Mapped[Any] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def spec_value(self):
        """Alias de compatibilidade com o frontend/código antigo."""
        return self.content

    @spec_value.setter
    def spec_value(self, value) -> None:
        self.content = value
