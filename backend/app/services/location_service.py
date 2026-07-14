from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from app.domain.enums import UserRole
from app.extensions import db
from app.models.inventory import Asset
from app.models.location import Location
from app.models.user import User
from app.utils.audit import log_action


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _parse_manager_id(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def location_to_dict(location: Location, asset_count: int | None = None, manager_email: str | None = None) -> dict:
    if asset_count is None:
        asset_count = db.session.execute(
            select(func.count(Asset.asset_id)).where(
                Asset.location_id == location.location_id,
                Asset.is_active == True,
            )
        ).scalar() or 0

    if manager_email is None and location.location_manager_id:
        manager_email = db.session.execute(
            select(User.email).where(User.user_id == location.location_manager_id)
        ).scalar_one_or_none()

    return {
        "location_id": location.location_id,
        "location_name": location.location_name,
        "name": location.location_name,
        "location_manager_id": location.location_manager_id,
        "manager_id": location.location_manager_id,
        "manager_email": manager_email,
        "status": "Operacional" if location.is_active else "Inativo",
        "is_active": location.is_active,
        "asset_count": asset_count,
    }


def get_all_locations(manager_id: int | None = None) -> list[dict]:
    query = select(Location).where(Location.is_active == True)
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)
    query = query.order_by(Location.location_name.asc())
    locations = db.session.execute(query).scalars().all()
    return [location_to_dict(location) for location in locations]


def get_location_by_id(location_id: int, manager_id: int | None = None) -> dict | None:
    query = select(Location).where(Location.location_id == location_id, Location.is_active == True)
    if manager_id is not None:
        query = query.where(Location.location_manager_id == manager_id)
    location = db.session.execute(query).scalar_one_or_none()
    if not location:
        return None
    return location_to_dict(location)


def _validate_manager(manager_id: Any) -> tuple[bool, str, int | None]:
    parsed = _parse_manager_id(manager_id)
    if parsed is None:
        return True, "Sem gestor associado.", None

    manager = db.session.execute(
        select(User).where(User.user_id == parsed, User.is_active == True)
    ).scalar_one_or_none()
    if not manager:
        return False, "Gestor não encontrado ou inativo.", None
    if manager.role != UserRole.MANAGER:
        return False, "Utilizador inválido para gestor responsável.", None
    return True, "Gestor válido.", parsed


def create_location(location_name: str, manager_id=None, user_id: int | None = None) -> tuple[bool, str, dict | None]:
    name = _clean(location_name)
    if not name:
        return False, "A designação do local é obrigatória.", None

    ok, message, parsed_manager_id = _validate_manager(manager_id)
    if not ok:
        return False, message, None

    existing = db.session.execute(
        select(Location).where(Location.location_name == name)
    ).scalar_one_or_none()

    if existing and existing.is_active:
        return False, "Já existe um local com esta designação.", None

    if existing:
        existing.is_active = True
        existing.location_manager_id = parsed_manager_id
        location = existing
    else:
        location = Location(location_name=name, location_manager_id=parsed_manager_id)
        db.session.add(location)
        db.session.flush()

    new_value = location_to_dict(location, 0)
    log_action(
        action="INSERT",
        table_name="locations",
        record_id=location.location_id,
        user_id=user_id,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Local criado com sucesso.", new_value


def update_location(
    location_id: int,
    location_name: str,
    manager_id=None,
    user_id: int | None = None,
) -> tuple[bool, str, dict | None]:
    location = db.session.execute(
        select(Location).where(Location.location_id == location_id, Location.is_active == True)
    ).scalar_one_or_none()

    if not location:
        return False, "Local não encontrado.", None

    name = _clean(location_name)
    if not name:
        return False, "A designação do local é obrigatória.", None

    ok, message, parsed_manager_id = _validate_manager(manager_id)
    if not ok:
        return False, message, None

    existing = db.session.execute(
        select(Location).where(Location.location_name == name, Location.location_id != location_id)
    ).scalar_one_or_none()
    if existing and existing.is_active:
        return False, "Já existe outro local com esta designação.", None

    old_value = location_to_dict(location)
    location.location_name = name
    location.location_manager_id = parsed_manager_id
    new_value = location_to_dict(location)

    log_action(
        action="UPDATE",
        table_name="locations",
        record_id=location.location_id,
        user_id=user_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Local atualizado com sucesso.", new_value


def delete_location(location_id: int, user_id: int | None = None) -> tuple[bool, str, dict | None]:
    location = db.session.execute(
        select(Location).where(Location.location_id == location_id, Location.is_active == True)
    ).scalar_one_or_none()
    if not location:
        return False, "Local não encontrado.", None

    asset_count = db.session.execute(
        select(func.count(Asset.asset_id)).where(Asset.location_id == location.location_id, Asset.is_active == True)
    ).scalar() or 0
    if asset_count:
        return False, "Não é possível remover um local com ativos ativos associados.", None

    old_value = location_to_dict(location, asset_count)
    location.is_active = False
    new_value = location_to_dict(location, 0)

    log_action(
        action="DELETE",
        table_name="locations",
        record_id=location.location_id,
        user_id=user_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Local removido com sucesso.", new_value
