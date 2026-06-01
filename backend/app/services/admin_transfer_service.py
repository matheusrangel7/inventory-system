from flask_jwt_extended import decode_token
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.admin_transfer import PendingAdminTransfer
from app.models.location import Location
from app.models.user import User
from app.services import email_service, session_service, user_service
from app.services.registration_token_service import (
    clear_registration_token,
    issue_registration_token,
    is_registration_token_expired,
)
from app.utils.audit import log_action


def validate_action_token(action_token: str, current_admin_id: int) -> tuple[bool, str]:
    if not action_token:
        return False, "action_token obrigatório."

    try:
        claims = decode_token(action_token)
    except Exception:
        return False, "action_token inválido ou expirado."

    if claims.get("sub") != str(current_admin_id):
        return False, "action_token não pertence ao utilizador autenticado."

    if claims.get("action") != "transfer_admin" or not claims.get("authorized"):
        return False, "action_token não autoriza esta operação."

    return True, "Token válido."


def get_pending_transfer() -> dict | None:
    transfer = db.session.execute(select(PendingAdminTransfer)).scalar_one_or_none()
    if not transfer:
        return None

    target = db.session.get(User, transfer.target_user_id)
    if not target:
        return None

    if (
        target.registration_status == "Pendente"
        and is_registration_token_expired(target)
    ):
        return None

    return {
        "transfer_id": transfer.transfer_id,
        "initiated_by": transfer.initiated_by,
        "target_user_id": target.user_id,
        "target_email": target.email,
        "expires_at": (
            target.registration_token_expires_at.isoformat()
            if target.registration_token_expires_at
            else None
        ),
        "created_at": transfer.created_at.isoformat() if transfer.created_at else None,
    }


def get_eligible_managers(current_admin_id: int) -> list[dict]:
    users = (
        db.session.execute(
            select(User)
            .where(
                User.role == "Gestor",
                User.registration_status == "Concluído",
                User.is_active == True,
                User.mfa_enabled == True,
                User.user_id != current_admin_id,
            )
            .order_by(User.email.asc())
        )
        .scalars()
        .all()
    )

    return [user_service.user_to_dict(user) for user in users]


def _ensure_no_pending_transfer() -> tuple[bool, str]:
    existing = db.session.execute(select(PendingAdminTransfer)).scalars().first()
    if existing:
        if expire_pending_for_target(existing.target_user_id):
            return True, "Transferência pendente expirada removida."
        return False, "Já existe uma transferência de administração em curso."
    return True, "Sem transferência pendente."


def has_pending_for_target(target_user_id: int) -> bool:
    return (
        db.session.execute(
            select(PendingAdminTransfer.transfer_id).where(
                PendingAdminTransfer.target_user_id == target_user_id
            )
        ).scalar_one_or_none()
        is not None
    )


def _remove_locations_from_user(user_id: int, actor_id: int) -> None:
    locations = (
        db.session.execute(
            select(Location).where(Location.location_manager_id == user_id)
        )
        .scalars()
        .all()
    )

    for location in locations:
        old_value = {"location_manager_id": user_id}
        location.location_manager_id = None
        log_action(
            action="UPDATE",
            table_name="locations",
            record_id=location.location_id,
            user_id=actor_id,
            old_value=old_value,
            new_value={"location_manager_id": None},
        )


def transfer_to_existing_admin(
    current_admin_id: int,
    target_user_id: int,
) -> tuple[bool, str]:
    ok, message = _ensure_no_pending_transfer()
    if not ok:
        return False, message

    current = db.session.get(User, current_admin_id)
    target = db.session.get(User, target_user_id)

    if not current or not current.is_active or current.role != "Administrador":
        return False, "Administrador atual inválido."

    if not target or not target.is_active:
        return False, "Utilizador alvo inválido."

    if target.user_id == current.user_id:
        return False, "Não pode transferir a administração para si próprio."

    if target.role != "Gestor":
        return False, "O utilizador selecionado não é um Gestor."

    if target.registration_status != "Concluído":
        return False, "O utilizador ainda não concluiu o registo."

    if not target.mfa_enabled:
        return False, "O utilizador precisa ter MFA configurado."

    _remove_locations_from_user(target.user_id, current.user_id)
    _remove_locations_from_user(current.user_id, current.user_id)

    current_old = {"role": current.role}
    target_old = {"role": target.role}

    current.role = "Gestor"
    log_action(
        "UPDATE",
        "users",
        current.user_id,
        user_id=current.user_id,
        old_value=current_old,
        new_value={"role": current.role},
    )

    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return False, "Não foi possível libertar a função de administrador atual."

    target.role = "Administrador"
    log_action(
        "UPDATE",
        "users",
        target.user_id,
        user_id=current.user_id,
        old_value=target_old,
        new_value={"role": target.role},
    )

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return False, "Não foi possível concluir a transferência de administração."

    session_service.revoke_all_sessions(current.user_id)
    session_service.revoke_all_sessions(target.user_id)

    email_service.send_admin_transfer_email(target.email)
    email_service.send_admin_demoted_email(current.email)

    return True, "Administração transferida com sucesso."


def start_transfer_to_new_admin(
    current_admin_id: int,
    email: str,
) -> tuple[bool, str, dict | None]:
    ok, message = _ensure_no_pending_transfer()
    if not ok:
        return False, message, None

    current = db.session.get(User, current_admin_id)
    if not current or current.role != "Administrador" or not current.is_active:
        return False, "Administrador atual inválido.", None

    existing = db.session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        ok, message, target, token = user_service.reactivate_inactive_gestor_invite(
            email=email,
            location_ids=[],
            admin_id=current_admin_id,
            allow_completed=False,
        )
        if not ok:
            return False, message, None
    else:
        (
            ok,
            message,
            target,
            token,
        ) = user_service.create_pending_user(
            email=email,
            role="Gestor",
            location_ids=[],
            actor_id=current_admin_id,
            require_locations=False,
        )
        if not ok:
            return False, message, None

    transfer = PendingAdminTransfer(
        initiated_by=current_admin_id, target_user_id=target.user_id
    )
    db.session.add(transfer)
    db.session.flush()

    log_action(
        action="INSERT",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=current_admin_id,
        new_value={
            "initiated_by": current_admin_id,
            "target_user_id": target.user_id,
        },
    )

    db.session.commit()

    email_sent = email_service.send_registration_email(target.email, token)
    data = get_pending_transfer()

    if not email_sent:
        return (
            True,
            (
                "Transferência iniciada, mas o email não foi enviado. "
                "Pode reenviar pelo banner."
            ),
            data,
        )

    return True, "Transferência iniciada e email enviado com sucesso.", data


def resend_pending_transfer_email(current_admin_id: int) -> tuple[bool, str]:
    transfer = db.session.execute(select(PendingAdminTransfer)).scalar_one_or_none()
    if not transfer:
        return False, "Não existe transferência pendente."

    if transfer.initiated_by != current_admin_id:
        return False, "Transferência pendente pertence a outro administrador."

    target = db.session.get(User, transfer.target_user_id)
    if not target or not target.is_active or target.registration_status == "Concluído":
        return False, "Utilizador alvo inválido."

    token = issue_registration_token(target)
    db.session.commit()

    email_sent = email_service.send_registration_email(target.email, token)
    if not email_sent:
        return False, "Erro no envio do email. Tente novamente."

    return True, "Email reenviado com sucesso."


def cancel_pending_transfer(current_admin_id: int) -> tuple[bool, str]:
    transfer = db.session.execute(select(PendingAdminTransfer)).scalar_one_or_none()
    if not transfer:
        return False, "Não existe transferência pendente."

    if transfer.initiated_by != current_admin_id:
        return False, "Transferência pendente pertence a outro administrador."

    target = db.session.get(User, transfer.target_user_id)
    old_value = {
        "transfer_id": transfer.transfer_id,
        "target_user_id": transfer.target_user_id,
    }

    if target:
        target.is_active = False
        clear_registration_token(target)

    db.session.delete(transfer)

    log_action(
        action="DELETE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=current_admin_id,
        old_value=old_value,
        new_value={"cancelled": True},
    )

    db.session.commit()

    return True, "Transferência cancelada com sucesso."


def expire_pending_for_target(target_user_id: int) -> bool:
    transfer = db.session.execute(
        select(PendingAdminTransfer).where(
            PendingAdminTransfer.target_user_id == target_user_id
        )
    ).scalar_one_or_none()

    if not transfer:
        return False

    target = db.session.get(User, target_user_id)
    if target and target.registration_status == "Concluído":
        return False

    if target and not is_registration_token_expired(target):
        return False

    old_value = {
        "transfer_id": transfer.transfer_id,
        "target_user_id": transfer.target_user_id,
    }

    if target:
        target.is_active = False
        clear_registration_token(target)

    db.session.delete(transfer)

    log_action(
        action="DELETE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=transfer.initiated_by,
        old_value=old_value,
        new_value={"expired": True},
    )

    db.session.commit()

    return True


def complete_pending_after_mfa(target_user_id: int) -> bool:
    transfer = db.session.execute(
        select(PendingAdminTransfer).where(
            PendingAdminTransfer.target_user_id == target_user_id
        )
    ).scalar_one_or_none()

    if not transfer:
        return False

    old_admin = db.session.get(User, transfer.initiated_by)
    new_admin = db.session.get(User, transfer.target_user_id)

    if not old_admin or not new_admin:
        return False

    if not old_admin.is_active or old_admin.role != "Administrador":
        return False

    if not new_admin.is_active or new_admin.registration_status != "Concluído":
        return False

    if new_admin.role != "Gestor":
        return False

    if not new_admin.mfa_enabled:
        return False

    _remove_locations_from_user(old_admin.user_id, old_admin.user_id)

    old_admin_old_value = {"role": old_admin.role}
    new_admin_old_value = {
        "role": new_admin.role,
        "registration_status": new_admin.registration_status,
    }

    old_admin.role = "Gestor"
    log_action(
        action="UPDATE",
        table_name="users",
        record_id=old_admin.user_id,
        user_id=old_admin.user_id,
        old_value=old_admin_old_value,
        new_value={"role": "Gestor"},
    )

    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return False

    new_admin.role = "Administrador"
    new_admin.registration_status = "Concluído"

    db.session.delete(transfer)

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=new_admin.user_id,
        user_id=old_admin.user_id,
        old_value=new_admin_old_value,
        new_value={"role": "Administrador", "registration_status": "Concluído"},
    )
    log_action(
        action="DELETE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=old_admin.user_id,
        old_value={
            "initiated_by": transfer.initiated_by,
            "target_user_id": transfer.target_user_id,
        },
        new_value={"completed": True},
    )

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return False

    session_service.revoke_all_sessions(old_admin.user_id)
    session_service.revoke_all_sessions(new_admin.user_id)

    email_service.send_admin_transfer_email(new_admin.email)
    email_service.send_admin_demoted_email(old_admin.email)

    return True
