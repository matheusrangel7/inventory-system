import secrets
from typing import Any

from sqlalchemy import select

from app.extensions import db, ph
from app.models.location import Location
from app.models.user import User
from app.services.email_service import send_registration_email
from app.utils.audit import log_action

VALID_ROLES = {"Gestor", "Administrador"}


def _clean_email(email: Any) -> str:
    return str(email or "").strip().lower()


def user_to_dict(user: User) -> dict:
    location_ids = [
        location.location_id
        for location in db.session.execute(
            select(Location).where(
                Location.location_manager_id == user.user_id,
                Location.is_active == True,
            )
        ).scalars().all()
    ]
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "registration_status": user.registration_status,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "location_ids": location_ids,
    }


def get_all_users() -> list[User]:
    return (
        db.session.execute(
            select(User).where(User.is_active == True).order_by(User.created_at.desc())
        )
        .scalars()
        .all()
    )


def get_pending_users() -> list[User]:
    return (
        db.session.execute(
            select(User)
            .where(User.registration_status == "Pendente")
            .where(User.is_active == True)
            .order_by(User.created_at.asc())
        )
        .scalars()
        .all()
    )


def _get_active_locations(location_ids: list[int]) -> tuple[bool, str, list[Location]]:
    if not isinstance(location_ids, list):
        return False, "location_ids deve ser uma lista.", []

    normalized_ids = []
    for raw_id in location_ids:
        try:
            normalized_ids.append(int(raw_id))
        except (TypeError, ValueError):
            return False, f"Sala com id{raw_id} inválida.", []

    locations: list[Location] = []
    for loc_id in normalized_ids:
        loc = db.session.execute(
            select(Location).where(Location.location_id == loc_id, Location.is_active == True)
        ).scalar_one_or_none()
        if not loc:
            return False, f"Sala com id{loc_id} não encontrada ou inativa.", []
        locations.append(loc)

    return True, "Salas válidas.", locations


def _assign_locations_to_user(user: User, locations: list[Location]) -> None:
    selected_ids = {location.location_id for location in locations}

    previous_locations = db.session.execute(
        select(Location).where(Location.location_manager_id == user.user_id)
    ).scalars().all()
    for location in previous_locations:
        if location.location_id not in selected_ids:
            location.location_manager_id = None

    for location in locations:
        location.location_manager_id = user.user_id


def create_user(
    email: str,
    role: str,
    location_ids: list[int],
    admin_id: int,
) -> tuple[bool, str, User | None]:
    email = _clean_email(email)
    role = role if role in VALID_ROLES else "Gestor"
    location_ids = location_ids or []

    if not email:
        return False, "Email é obrigatório.", None

    if role == "Gestor" and not location_ids:
        return False, "É necessário atribuir pelo menos uma sala ao gestor.", None

    existing = db.session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        return False, "Já existe um utilizador com este email.", None

    ok, message, locations = _get_active_locations(location_ids)
    if not ok:
        return False, message, None

    random_password = secrets.token_urlsafe(32)
    password_hash = ph.hash(random_password)
    del random_password

    registration_token = secrets.token_hex(32)
    new_user = User(
        email=email,
        password_hash=password_hash,
        role=role,
        registration_status="Pendente",
        registration_token=registration_token,
    )
    db.session.add(new_user)
    db.session.flush()

    _assign_locations_to_user(new_user, locations)

    log_action(
        action="INSERT",
        table_name="users",
        record_id=new_user.user_id,
        user_id=admin_id,
        new_value={
            "email": email,
            "role": role,
            "registration_status": "Pendente",
            "locations": location_ids,
        },
    )

    db.session.commit()

    email_sent = send_registration_email(email, registration_token)
    if not email_sent:
        return (
            True,
            "Utilizador criado mas o email de registo não foi enviado. Verifique a configuração do servidor de email.",
            new_user,
        )
    return True, "Utilizador criado e email de registo enviado com sucesso.", new_user


def create_gestor(email: str, location_ids: list[int], admin_id: int) -> tuple[bool, str, User | None]:
    return create_user(email=email, role="Gestor", location_ids=location_ids, admin_id=admin_id)


def update_user(
    user_id: int,
    email: str,
    role: str,
    location_ids: list[int],
    admin_id: int,
) -> tuple[bool, str, User | None]:
    user = db.session.execute(
        select(User).where(User.user_id == user_id, User.is_active == True)
    ).scalar_one_or_none()
    if not user:
        return False, "Utilizador não encontrado.", None

    email = _clean_email(email)
    role = role if role in VALID_ROLES else user.role
    location_ids = location_ids or []

    if not email:
        return False, "Email é obrigatório.", None
    if role == "Gestor" and not location_ids:
        return False, "É necessário atribuir pelo menos uma sala ao gestor.", None

    existing = db.session.execute(
        select(User).where(User.email == email, User.user_id != user_id)
    ).scalar_one_or_none()
    if existing:
        return False, "Já existe outro utilizador com este email.", None

    ok, message, locations = _get_active_locations(location_ids)
    if not ok:
        return False, message, None

    old_value = user_to_dict(user)
    user.email = email
    user.role = role
    _assign_locations_to_user(user, locations)

    new_value = user_to_dict(user)
    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()
    return True, "Utilizador atualizado com sucesso.", user


def delete_user(user_id: int, admin_id: int) -> tuple[bool, str, User | None]:
    user = db.session.execute(
        select(User).where(User.user_id == user_id, User.is_active == True)
    ).scalar_one_or_none()
    if not user:
        return False, "Utilizador não encontrado.", None

    if user.user_id == admin_id:
        return False, "Não pode remover a própria conta autenticada.", None

    old_value = user_to_dict(user)
    user.is_active = False
    user.registration_token = None

    previous_locations = db.session.execute(
        select(Location).where(Location.location_manager_id == user.user_id)
    ).scalars().all()
    for location in previous_locations:
        location.location_manager_id = None

    log_action(
        action="DELETE",
        table_name="users",
        record_id=user.user_id,
        user_id=admin_id,
        old_value=old_value,
        new_value={**old_value, "is_active": False},
    )
    db.session.commit()
    return True, "Utilizador removido com sucesso.", user
