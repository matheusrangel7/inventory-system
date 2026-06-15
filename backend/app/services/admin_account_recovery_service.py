import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.domain.enums import RegistrationStatus, UserRole
from app.extensions import db
from app.models.mfa_reconfiguration import MfaReconfiguration
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services import (
    admin_confirmation_service,
    email_service,
    password_reset_service,
    session_service,
)
from app.utils.audit import log_action

logger = logging.getLogger(__name__)

INVALID_TARGET_MESSAGE = "Utilizador inválido para recuperação."
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _failure(message: str, status: int = 400):
    db.session.rollback()
    return False, message, None, status


def _confirm_and_lock_target(
    administrator_id: int,
    target_user_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None, User | None, int]:
    try:
        ok, message, administrator = (
            admin_confirmation_service.confirm_administrator(
                administrator_id,
                password,
                totp_code,
            )
        )
        if not ok:
            return False, message, None, None, 400

        target = db.session.execute(
            select(User)
            .where(User.user_id == target_user_id)
            .with_for_update()
        ).scalar_one_or_none()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao validar recuperação administrativa."
        )
        return (
            False,
            "Não foi possível processar a recuperação de acesso.",
            None,
            None,
            500,
        )

    if (
        not target
        or target.user_id == administrator_id
        or not target.is_active
        or target.role != UserRole.MANAGER
        or target.registration_status != RegistrationStatus.COMPLETED
    ):
        db.session.rollback()
        return False, INVALID_TARGET_MESSAGE, None, None, 400

    return True, "Utilizador validado.", administrator, target, 200


def _notification_message(success_message: str, sent: bool) -> str:
    if sent:
        return success_message
    return (
        f"{success_message} Não foi possível enviar uma ou mais notificações "
        "por email."
    )


def change_email(
    administrator_id: int,
    target_user_id: int,
    new_email: str,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None, int]:
    ok, message, administrator, target, status = _confirm_and_lock_target(
        administrator_id,
        target_user_id,
        password,
        totp_code,
    )
    if not ok or not administrator or not target:
        return False, message, None, status

    normalized_email = str(new_email or "").strip().lower()
    if (
        not normalized_email
        or len(normalized_email) > 255
        or not EMAIL_PATTERN.fullmatch(normalized_email)
    ):
        return _failure("Email inválido.")
    if normalized_email == target.email:
        return _failure("O novo email deve ser diferente do email atual.")

    old_email = target.email
    try:
        existing_user_id = db.session.execute(
            select(User.user_id)
            .where(
                User.email == normalized_email,
                User.user_id != target.user_id,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if existing_user_id is not None:
            return _failure("Já existe um utilizador com este email.", status=409)

        reset_token = db.session.execute(
            select(PasswordResetToken)
            .where(PasswordResetToken.user_id == target.user_id)
            .with_for_update()
        ).scalar_one_or_none()
        if reset_token is not None:
            reset_token.used_at = datetime.now(timezone.utc)

        target.email = normalized_email
        session_service.apply_revoke_all_sessions(target.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=target.user_id,
            user_id=administrator.user_id,
            old_value={"email": old_email},
            new_value={
                "email": normalized_email,
                "password_reset_invalidated": reset_token is not None,
                "sessions_revoked": True,
                "recovery_performed_by_admin": True,
            },
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return False, "Já existe um utilizador com este email.", None, 409
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao alterar email na recuperação administrativa."
        )
        return False, "Não foi possível alterar o email.", None, 500

    old_notified = email_service.send_recovery_email_changed_old_address(
        old_email,
        normalized_email,
    )
    new_notified = email_service.send_recovery_email_changed_new_address(
        normalized_email,
        old_email,
    )
    return (
        True,
        _notification_message(
            "Email alterado com sucesso.",
            old_notified and new_notified,
        ),
        target,
        200,
    )


def request_password_reset(
    administrator_id: int,
    target_user_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None, int]:
    ok, message, administrator, target, status = _confirm_and_lock_target(
        administrator_id,
        target_user_id,
        password,
        totp_code,
    )
    if not ok or not administrator or not target:
        return False, message, None, status

    try:
        raw_token = password_reset_service.issue_password_reset_token(target)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=target.user_id,
            user_id=administrator.user_id,
            old_value=None,
            new_value={
                "password_reset_requested_by_admin": True,
            },
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao emitir recuperação administrativa de password."
        )
        return False, "Não foi possível enviar a recuperação de password.", None, 500

    notified = email_service.send_password_reset_email(target.email, raw_token)
    return (
        True,
        _notification_message(
            "Link de redefinição de password emitido com sucesso.",
            notified,
        ),
        target,
        200,
    )


def reset_mfa(
    administrator_id: int,
    target_user_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None, int]:
    ok, message, administrator, target, status = _confirm_and_lock_target(
        administrator_id,
        target_user_id,
        password,
        totp_code,
    )
    if not ok or not administrator or not target:
        return False, message, None, status

    if not target.mfa_enabled or not target.totp_secret_encrypted:
        return _failure("O utilizador não tem MFA configurado.")

    try:
        pending_reconfiguration = db.session.execute(
            select(MfaReconfiguration)
            .where(MfaReconfiguration.user_id == target.user_id)
            .with_for_update()
        ).scalar_one_or_none()
        if pending_reconfiguration is not None:
            db.session.delete(pending_reconfiguration)

        target.totp_secret_encrypted = None
        target.mfa_enabled = False
        target.mfa_recovery_code_hash = None
        session_service.apply_revoke_all_sessions(target.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=target.user_id,
            user_id=administrator.user_id,
            old_value={"mfa_enabled": True},
            new_value={
                "mfa_enabled": False,
                "mfa_reconfiguration_cancelled": (
                    pending_reconfiguration is not None
                ),
                "sessions_revoked": True,
                "recovery_performed_by_admin": True,
            },
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao redefinir MFA administrativamente."
        )
        return False, "Não foi possível redefinir o MFA.", None, 500

    notified = email_service.send_administrative_mfa_reset_email(target.email)
    return (
        True,
        _notification_message("MFA redefinido com sucesso.", notified),
        target,
        200,
    )
