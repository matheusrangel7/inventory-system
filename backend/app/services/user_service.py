import secrets
from typing import Any

from sqlalchemy import select

from app.domain.enums import RegistrationStatus, UserRole
from app.extensions import db, ph
from app.models.location import Location
from app.models.user import User
from app.services import email_service, session_service
from app.services.registration_token_service import (
    clear_registration_token,
    issue_registration_token,
)
from app.utils.audit import log_action


def _clean_email(email: Any) -> str:
    return str(email or "").strip().lower()


def _location_ids_by_user_ids(user_ids: list[int]) -> dict[int, list[int]]:
    if not user_ids:
        return {}

    rows = (
        db.session.execute(
            select(Location.location_manager_id, Location.location_id).where(
                Location.location_manager_id.in_(user_ids),
                Location.is_active == True,
            )
        )
        .all()
    )

    location_ids_by_user = {user_id: [] for user_id in user_ids}
    for manager_id, location_id in rows:
        location_ids_by_user.setdefault(manager_id, []).append(location_id)

    return location_ids_by_user


def user_to_dict(user: User, location_ids: list[int] | None = None) -> dict:
    if location_ids is None:
        location_ids = _location_ids_by_user_ids([user.user_id]).get(user.user_id, [])

    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "registration_status": user.registration_status,
        "mfa_enabled": user.mfa_enabled,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "location_ids": location_ids,
    }


def _user_audit_dict(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "registration_status": user.registration_status,
        "mfa_enabled": user.mfa_enabled,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def get_all_gestores() -> list[dict]:
    users = (
        db.session.execute(
            select(User)
            .where(User.role == UserRole.MANAGER, User.is_active == True)
            .order_by(User.created_at.desc())
        )
        .scalars()
        .all()
    )
    location_ids_by_user = _location_ids_by_user_ids([user.user_id for user in users])
    return [
        user_to_dict(user, location_ids_by_user.get(user.user_id, []))
        for user in users
    ]


def get_pending_gestores() -> list[dict]:
    users = (
        db.session.execute(
            select(User).where(
                User.role == UserRole.MANAGER,
                User.is_active == True,
                User.registration_status == RegistrationStatus.PENDING,
            )
        )
        .scalars()
        .all()
    )
    location_ids_by_user = _location_ids_by_user_ids([user.user_id for user in users])
    return [
        user_to_dict(user, location_ids_by_user.get(user.user_id, []))
        for user in users
    ]


def _get_active_locations(
    location_ids: list[int],
    allowed_manager_id: int | None = None,
) -> tuple[bool, str, list[Location]]:
    if not isinstance(location_ids, list):
        return False, "location_ids deve ser uma lista.", []

    normalized_ids = []
    for raw_id in location_ids:
        try:
            normalized_ids.append(int(raw_id))
        except (TypeError, ValueError):
            return False, f"Sala com id{raw_id} inválida.", []

    if not normalized_ids:
        return True, "Salas válidas.", []

    locations = (
        db.session.execute(
            select(Location).where(
                Location.location_id.in_(normalized_ids),
                Location.is_active == True,
            ).with_for_update()
        )
        .scalars()
        .all()
    )

    if len(locations) != len(normalized_ids):
        return False, "Uma ou mais salas não foram encontradas ou estão inativas.", []

    unavailable = [
        location
        for location in locations
        if location.location_manager_id is not None
        and location.location_manager_id != allowed_manager_id
    ]
    if unavailable:
        return False, "Uma ou mais salas já têm um gestor associado.", []

    return True, "Salas válidas.", locations


def _assign_locations_to_user(user: User, locations: list[Location]) -> None:
    selected_ids = {location.location_id for location in locations}

    previous_locations = (
        db.session.execute(
            select(Location).where(Location.location_manager_id == user.user_id)
        )
        .scalars()
        .all()
    )
    for location in previous_locations:
        if location.location_id not in selected_ids:
            location.location_manager_id = None

    for location in locations:
        location.location_manager_id = user.user_id


def create_pending_gestor(
    email: str,
    location_ids: list[int],
    actor_id: int,
    require_locations: bool = True,
) -> tuple[bool, str, User | None, str | None]:
    email = _clean_email(email)
    location_ids = location_ids or []

    if not email:
        return False, "Email é obrigatório.", None, None

    if require_locations and not location_ids:
        return False, "É necessário atribuir pelo menos uma sala ao gestor.", None, None

    existing = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if existing:
        return False, "Já existe um utilizador com este email.", None, None

    ok, message, locations = _get_active_locations(location_ids)
    if not ok:
        return False, message, None, None

    random_password = secrets.token_urlsafe(32)

    user = User(
        email=email,
        password_hash=ph.hash(random_password),
        role=UserRole.MANAGER,
        registration_status=RegistrationStatus.PENDING,
    )
    del random_password

    db.session.add(user)
    db.session.flush()

    token = issue_registration_token(user)
    _assign_locations_to_user(user, locations)

    log_action(
        action="INSERT",
        table_name="users",
        record_id=user.user_id,
        user_id=actor_id,
        new_value={
            "email": user.email,
            "role": user.role,
            "registration_status": user.registration_status,
            "location_ids": location_ids,
        },
    )

    return True, "Utilizador pendente criado.", user, token


def _create_gestor_error_status(message: str) -> int:
    if "Já existe" in message:
        return 409
    return 400


def _can_reactivate_inactive_gestor(user: User | None, allow_completed: bool) -> bool:
    if not user:
        return False
    if user.is_active or user.role != UserRole.MANAGER:
        return False
    if user.registration_status == RegistrationStatus.PENDING:
        return True
    return (
        allow_completed
        and user.registration_status == RegistrationStatus.COMPLETED
    )


def _reset_completed_gestor_for_invite(user: User) -> None:
    random_password = secrets.token_urlsafe(32)
    user.password_hash = ph.hash(random_password)
    del random_password
    user.totp_secret_encrypted = None
    user.mfa_enabled = False
    user.mfa_recovery_code_hash = None


def _is_completed_registration_email_change(user: User, email: str) -> bool:
    return (
        user.registration_status == RegistrationStatus.COMPLETED
        and email != user.email
    )


def reactivate_inactive_gestor_invite(
    email: str,
    location_ids: list[int],
    admin_id: int,
    allow_completed: bool = False,
) -> tuple[bool, str, User | None, str | None]:
    user = db.session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        return False, "Utilizador não encontrado.", None, None

    if not _can_reactivate_inactive_gestor(user, allow_completed):
        return False, "Já existe um utilizador com este email.", None, None

    ok, message, locations = _get_active_locations(
        location_ids,
        allowed_manager_id=user.user_id,
    )
    if not ok:
        return False, message, None, None

    old_value = _user_audit_dict(user)

    if user.registration_status == RegistrationStatus.COMPLETED:
        _reset_completed_gestor_for_invite(user)

    user.is_active = True
    user.registration_status = RegistrationStatus.PENDING
    token = issue_registration_token(user)
    _assign_locations_to_user(user, locations)

    new_value = {
        **_user_audit_dict(user),
        "location_ids": location_ids,
    }

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=new_value,
    )

    return True, "Utilizador reativado.", user, token


def create_gestor(
    email: str, location_ids: list[int], admin_id: int
) -> tuple[bool, str, User | None, int]:
    ok, message, user, token = create_pending_gestor(
        email=email,
        location_ids=location_ids,
        actor_id=admin_id,
    )
    if not ok:
        if "Já existe" not in message:
            return False, message, None, _create_gestor_error_status(message)

        ok, message, user, token = reactivate_inactive_gestor_invite(
            _clean_email(email),
            location_ids or [],
            admin_id,
            allow_completed=True,
        )
        if not ok:
            return False, message, None, _create_gestor_error_status(message)

    success_prefix = (
        "Utilizador criado."
        if message == "Utilizador pendente criado."
        else message
    )

    db.session.commit()

    session_service.revoke_all_sessions(user.user_id)

    email_sent = email_service.send_registration_email(user.email, token)
    if not email_sent:
        return (
            True,
            (
                f"{success_prefix} Mas o email não foi enviado. "
                "Pode reenviar o email na lista de utilizadores."
            ),
            user,
            201,
        )

    return True, f"{success_prefix} Email de registo enviado com sucesso.", user, 201


def update_user(
    user_id: int,
    email: str,
    location_ids: list[int],
    admin_id: int,
) -> tuple[bool, str, User | None]:
    user = db.session.execute(
        select(User).where(User.user_id == user_id, User.is_active == True)
    ).scalar_one_or_none()
    if not user:
        return False, "Utilizador não encontrado.", None

    email = _clean_email(email)
    location_ids = location_ids or []

    if user.role != UserRole.MANAGER:
        return (
            False,
            "Apenas gestores podem ser editados por esta rota.",
            None,
        )

    if not email:
        return False, "Email é obrigatório.", None

    email_changed = email != user.email
    if _is_completed_registration_email_change(user, email):
        return (
            False,
            "Email de utilizador com registo concluído não pode ser alterado.",
            None,
        )

    existing = db.session.execute(
        select(User).where(User.email == email, User.user_id != user_id)
    ).scalar_one_or_none()
    if existing:
        return False, "Já existe outro utilizador com este email.", None

    ok, message, locations = _get_active_locations(
        location_ids,
        allowed_manager_id=user.user_id,
    )
    if not ok:
        return False, message, None

    old_value = _user_audit_dict(user)
    user.email = email
    _assign_locations_to_user(user, locations)
    token = issue_registration_token(user) if email_changed else None

    new_value = _user_audit_dict(user)
    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        user_id=admin_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.session.commit()

    if token:
        email_sent = email_service.send_registration_email(user.email, token)
        if not email_sent:
            return (
                True,
                (
                    "Utilizador atualizado com sucesso. Mas o email de registo "
                    "não foi enviado. Pode reenviar o email na lista de utilizadores."
                ),
                user,
            )

        return (
            True,
            "Utilizador atualizado com sucesso. Email de registo reenviado.",
            user,
        )

    return True, "Utilizador atualizado com sucesso.", user


def delete_user(user_id: int, admin_id: int) -> tuple[bool, str, User | None]:
    user = db.session.execute(
        select(User).where(User.user_id == user_id, User.is_active == True)
    ).scalar_one_or_none()
    if not user:
        return False, "Utilizador não encontrado.", None

    if user.user_id == admin_id:
        return False, "Não pode remover a própria conta autenticada.", None

    if user.role != UserRole.MANAGER:
        return False, "Apenas gestores podem ser removidos por esta rota.", None

    old_value = _user_audit_dict(user)
    user.is_active = False
    clear_registration_token(user)

    previous_locations = (
        db.session.execute(
            select(Location).where(Location.location_manager_id == user.user_id)
        )
        .scalars()
        .all()
    )
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
    session_service.revoke_all_sessions(user.user_id)
    return True, "Utilizador removido com sucesso.", user


def resend_registration_email(user_id: int) -> tuple[bool, str]:
    user = db.session.get(User, user_id)

    if not user:
        return False, "Utilizador não encontrado."
    if not user.is_active:
        return False, "Conta desativada."
    if user.registration_status == RegistrationStatus.COMPLETED:
        return False, "O registo deste utilizador já foi concluído."

    token = issue_registration_token(user)
    db.session.commit()

    email_sent = email_service.send_registration_email(user.email, token)
    if not email_sent:
        return False, "Erro no envio do email. Tente novamente."

    return True, "Email reenviado com sucesso."
