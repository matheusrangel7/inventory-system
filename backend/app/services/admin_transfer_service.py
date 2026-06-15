import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.domain.enums import AdminTransferStatus, RegistrationStatus, UserRole
from app.extensions import db
from app.models.admin_transfer import PendingAdminTransfer
from app.models.location import Location
from app.models.user import User
from app.services import (
    admin_confirmation_service,
    email_service,
    session_service,
    user_service,
)
from app.services.registration_token_service import (
    clear_registration_token,
    issue_registration_token,
    is_registration_token_expired,
)
from app.utils.audit import log_action

logger = logging.getLogger(__name__)
INVALID_CONFIRMATION_MESSAGE = (
    admin_confirmation_service.INVALID_CONFIRMATION_MESSAGE
)


@dataclass(frozen=True)
class AdminTransferCompletion:
    old_admin_id: int
    old_admin_email: str
    new_admin_id: int
    new_admin_email: str


def _pending_transfer_stmt(*, for_update: bool = False):
    statement = select(PendingAdminTransfer).where(
        PendingAdminTransfer.status == AdminTransferStatus.PENDING
    )
    return statement.with_for_update() if for_update else statement


def _resolve_transfer(
    transfer: PendingAdminTransfer,
    status: AdminTransferStatus,
) -> None:
    transfer.status = status
    transfer.resolved_at = datetime.now(timezone.utc)


def _resolved_transfer_value(transfer: PendingAdminTransfer, event: str) -> dict:
    return {
        "event": event,
        "status": transfer.status,
        "resolved_at": (
            transfer.resolved_at.isoformat() if transfer.resolved_at else None
        ),
    }


def _confirm_transfer_credentials(
    current_admin_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None]:
    return admin_confirmation_service.confirm_administrator(
        current_admin_id,
        password,
        totp_code,
    )


def get_pending_transfer() -> dict | None:
    transfer = db.session.execute(_pending_transfer_stmt()).scalar_one_or_none()
    if not transfer:
        return None

    target = db.session.get(User, transfer.target_user_id)
    if not target:
        return None

    if (
        target.registration_status == RegistrationStatus.PENDING
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
                User.role == UserRole.MANAGER,
                User.registration_status == RegistrationStatus.COMPLETED,
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
    existing = (
        db.session.execute(_pending_transfer_stmt(for_update=True)).scalars().first()
    )
    if existing:
        if expire_pending_for_target(existing.target_user_id):
            return True, "Transferência pendente expirada encerrada."
        return False, "Já existe uma transferência de administração em curso."
    return True, "Sem transferência pendente."


def has_pending_for_target(target_user_id: int) -> bool:
    return (
        db.session.execute(
            select(PendingAdminTransfer.transfer_id).where(
                PendingAdminTransfer.target_user_id == target_user_id,
                PendingAdminTransfer.status == AdminTransferStatus.PENDING,
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
        location.location_manager_id = None
        log_action(
            action="UPDATE",
            table_name="locations",
            record_id=location.location_id,
            user_id=actor_id,
            old_value={"location_manager_id": user_id},
            new_value={"location_manager_id": None},
        )


def transfer_to_existing_admin(
    current_admin_id: int,
    target_user_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str]:
    ok, message = _ensure_no_pending_transfer()
    if not ok:
        return False, message

    ok, message, current = _confirm_transfer_credentials(
        current_admin_id,
        password,
        totp_code,
    )
    if not ok:
        return False, message

    target = db.session.execute(
        select(User).where(User.user_id == target_user_id).with_for_update()
    ).scalar_one_or_none()

    if not current:
        return False, "Administrador atual inválido."
    if not target or not target.is_active:
        return False, "Utilizador alvo inválido."
    if target.user_id == current.user_id:
        return False, "Não pode transferir a administração para si próprio."
    if target.role != UserRole.MANAGER:
        return False, "O utilizador selecionado não é um Gestor."
    if target.registration_status != RegistrationStatus.COMPLETED:
        return False, "O utilizador ainda não concluiu o registo."
    if not target.mfa_enabled:
        return False, "O utilizador precisa ter MFA configurado."

    _remove_locations_from_user(target.user_id, current.user_id)
    _remove_locations_from_user(current.user_id, current.user_id)

    current_old = {"role": current.role}
    target_old = {"role": target.role}
    current.role = UserRole.MANAGER
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

    target.role = UserRole.ADMINISTRATOR
    log_action(
        "UPDATE",
        "users",
        target.user_id,
        user_id=current.user_id,
        old_value=target_old,
        new_value={"role": target.role},
    )

    completion = AdminTransferCompletion(
        old_admin_id=current.user_id,
        old_admin_email=current.email,
        new_admin_id=target.user_id,
        new_admin_email=target.email,
    )

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return False, "Não foi possível concluir a transferência de administração."

    notify_admin_transfer_completion(completion)
    return True, "Administração transferida com sucesso."


def start_transfer_to_new_admin(
    current_admin_id: int,
    email: str,
    password: str,
    totp_code: str,
) -> tuple[bool, str, dict | None]:
    ok, message = _ensure_no_pending_transfer()
    if not ok:
        return False, message, None

    ok, message, current = _confirm_transfer_credentials(
        current_admin_id,
        password,
        totp_code,
    )
    if not ok:
        return False, message, None

    if not current:
        return False, "Administrador atual inválido.", None

    existing = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
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
        ok, message, target, token = user_service.create_pending_gestor(
            email=email,
            location_ids=[],
            actor_id=current_admin_id,
            require_locations=False,
        )
        if not ok:
            return False, message, None

    transfer = PendingAdminTransfer(
        initiated_by=current_admin_id,
        target_user_id=target.user_id,
        status=AdminTransferStatus.PENDING,
    )
    db.session.add(transfer)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return False, "Já existe uma transferência de administração em curso.", None

    log_action(
        action="INSERT",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=current_admin_id,
        new_value={
            "initiated_by": current_admin_id,
            "target_user_id": target.user_id,
            "status": transfer.status,
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
    transfer = db.session.execute(
        _pending_transfer_stmt(for_update=True)
    ).scalar_one_or_none()
    if not transfer:
        return False, "Não existe transferência pendente."
    if transfer.initiated_by != current_admin_id:
        return False, "Transferência pendente pertence a outro administrador."

    target = db.session.get(User, transfer.target_user_id)
    if (
        not target
        or not target.is_active
        or target.registration_status == RegistrationStatus.COMPLETED
    ):
        return False, "Utilizador alvo inválido."

    token = issue_registration_token(target)
    db.session.commit()
    if not email_service.send_registration_email(target.email, token):
        return False, "Erro no envio do email. Tente novamente."
    return True, "Email reenviado com sucesso."


def cancel_pending_transfer(current_admin_id: int) -> tuple[bool, str]:
    transfer = db.session.execute(
        _pending_transfer_stmt(for_update=True)
    ).scalar_one_or_none()
    if not transfer:
        return False, "Não existe transferência pendente."
    if transfer.initiated_by != current_admin_id:
        return False, "Transferência pendente pertence a outro administrador."

    target = db.session.get(User, transfer.target_user_id)
    old_value = {
        "transfer_id": transfer.transfer_id,
        "target_user_id": transfer.target_user_id,
        "status": transfer.status,
    }
    if target:
        target.is_active = False
        clear_registration_token(target)

    _resolve_transfer(transfer, AdminTransferStatus.CANCELLED)
    log_action(
        action="UPDATE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=current_admin_id,
        old_value=old_value,
        new_value=_resolved_transfer_value(transfer, "cancelled"),
    )
    db.session.commit()
    return True, "Transferência cancelada com sucesso."


def expire_pending_for_target(target_user_id: int) -> bool:
    transfer = db.session.execute(
        select(PendingAdminTransfer)
        .where(
            PendingAdminTransfer.target_user_id == target_user_id,
            PendingAdminTransfer.status == AdminTransferStatus.PENDING,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if not transfer:
        return False

    target = db.session.get(User, target_user_id)
    if target and target.registration_status == RegistrationStatus.COMPLETED:
        return False
    if target and not is_registration_token_expired(target):
        return False

    old_value = {
        "transfer_id": transfer.transfer_id,
        "target_user_id": transfer.target_user_id,
        "status": transfer.status,
    }
    if target:
        target.is_active = False
        clear_registration_token(target)

    _resolve_transfer(transfer, AdminTransferStatus.EXPIRED)
    log_action(
        action="UPDATE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=transfer.initiated_by,
        old_value=old_value,
        new_value=_resolved_transfer_value(transfer, "expired"),
    )
    db.session.commit()
    return True


def apply_pending_after_mfa(
    target_user_id: int,
) -> AdminTransferCompletion | None:
    transfer = db.session.execute(
        select(PendingAdminTransfer)
        .where(
            PendingAdminTransfer.target_user_id == target_user_id,
            PendingAdminTransfer.status == AdminTransferStatus.PENDING,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if not transfer:
        return None

    old_admin = db.session.execute(
        select(User)
        .where(User.user_id == transfer.initiated_by)
        .with_for_update()
    ).scalar_one_or_none()
    new_admin = db.session.execute(
        select(User)
        .where(User.user_id == transfer.target_user_id)
        .with_for_update()
    ).scalar_one_or_none()

    if not old_admin or not new_admin:
        return None
    if not old_admin.is_active or old_admin.role != UserRole.ADMINISTRATOR:
        return None
    if (
        not new_admin.is_active
        or new_admin.registration_status != RegistrationStatus.COMPLETED
    ):
        return None
    if new_admin.role != UserRole.MANAGER or not new_admin.mfa_enabled:
        return None

    _remove_locations_from_user(old_admin.user_id, old_admin.user_id)
    old_admin_old_value = {"role": old_admin.role}
    new_admin_old_value = {
        "role": new_admin.role,
        "registration_status": new_admin.registration_status,
    }

    old_admin.role = UserRole.MANAGER
    log_action(
        action="UPDATE",
        table_name="users",
        record_id=old_admin.user_id,
        user_id=old_admin.user_id,
        old_value=old_admin_old_value,
        new_value={"role": UserRole.MANAGER},
    )
    db.session.flush()

    new_admin.role = UserRole.ADMINISTRATOR
    new_admin.registration_status = RegistrationStatus.COMPLETED
    _resolve_transfer(transfer, AdminTransferStatus.COMPLETED)

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=new_admin.user_id,
        user_id=old_admin.user_id,
        old_value=new_admin_old_value,
        new_value={
            "role": UserRole.ADMINISTRATOR,
            "registration_status": RegistrationStatus.COMPLETED,
        },
    )
    log_action(
        action="UPDATE",
        table_name="pending_admin_transfer",
        record_id=transfer.transfer_id,
        user_id=old_admin.user_id,
        old_value={
            "initiated_by": transfer.initiated_by,
            "target_user_id": transfer.target_user_id,
            "status": AdminTransferStatus.PENDING,
        },
        new_value=_resolved_transfer_value(transfer, "completed"),
    )

    return AdminTransferCompletion(
        old_admin_id=old_admin.user_id,
        old_admin_email=old_admin.email,
        new_admin_id=new_admin.user_id,
        new_admin_email=new_admin.email,
    )


def notify_admin_transfer_completion(
    completion: AdminTransferCompletion,
) -> None:
    for user_id in (completion.old_admin_id, completion.new_admin_id):
        try:
            session_service.revoke_all_sessions(user_id)
        except Exception:
            db.session.rollback()
            logger.exception(
                "Falha ao revogar sessões após transferência de administração "
                "para o utilizador %s.",
                user_id,
            )

    _send_transfer_notification(
        email_service.send_admin_transfer_email,
        completion.new_admin_email,
        "promoção",
    )
    _send_transfer_notification(
        email_service.send_admin_demoted_email,
        completion.old_admin_email,
        "alteração de perfil",
    )


def _send_transfer_notification(
    send_email: Callable[[str], bool],
    email: str,
    event: str,
) -> None:
    try:
        if not send_email(email):
            logger.warning(
                "Email de %s não enviado para %s após transferência "
                "de administração.",
                event,
                email,
            )
    except Exception:
        logger.exception(
            "Falha inesperada ao enviar email de %s para %s.",
            event,
            email,
        )
