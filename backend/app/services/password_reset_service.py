import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.constants import PASSWORD_RESET_TOKEN_MINUTES
from app.domain.enums import RegistrationStatus
from app.extensions import db, ph
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services import email_service, session_service
from app.services.password_service import validate_password
from app.utils.audit import log_action

logger = logging.getLogger(__name__)

GENERIC_REQUEST_MESSAGE = (
    "Se existir uma conta ativa associada ao email indicado, receberá "
    "as instruções de recuperação."
)
INVALID_TOKEN_MESSAGE = "O link de recuperação é inválido ou já não está ativo."


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def request_password_reset(email: str) -> str:
    try:
        user = db.session.execute(
            select(User)
            .where(User.email == email)
            .with_for_update()
        ).scalar_one_or_none()

        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
        ):
            return GENERIC_REQUEST_MESSAGE

        now = datetime.now(timezone.utc)
        raw_token = secrets.token_urlsafe(48)
        token_hash = _hash_token(raw_token)

        reset_token = db.session.execute(
            select(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.user_id)
            .with_for_update()
        ).scalar_one_or_none()

        if reset_token is None:
            reset_token = PasswordResetToken(
                user_id=user.user_id,
                token_hash=token_hash,
            )
            db.session.add(reset_token)
        else:
            reset_token.token_hash = token_hash

        reset_token.created_at = now
        reset_token.expires_at = now + timedelta(
            minutes=PASSWORD_RESET_TOKEN_MINUTES
        )
        reset_token.used_at = None
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Erro de base de dados ao criar token de recuperação.")
        return GENERIC_REQUEST_MESSAGE

    if not email_service.send_password_reset_email(user.email, raw_token):
        logger.warning(
            "Não foi possível enviar o email de recuperação ao utilizador %s.",
            user.user_id,
        )

    return GENERIC_REQUEST_MESSAGE


def is_reset_token_valid(token: str) -> bool:
    if not token:
        return False

    now = datetime.now(timezone.utc)
    reset_token = db.session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == _hash_token(token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    ).scalar_one_or_none()

    return reset_token is not None


def complete_password_reset(token: str, new_password: str) -> tuple[bool, str]:
    password_ok, password_message = validate_password(new_password)
    if not password_ok:
        return False, password_message

    now = datetime.now(timezone.utc)

    try:
        reset_token = db.session.execute(
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == _hash_token(token))
            .with_for_update()
        ).scalar_one_or_none()

        if (
            not reset_token
            or reset_token.used_at is not None
            or reset_token.expires_at <= now
        ):
            db.session.rollback()
            return False, INVALID_TOKEN_MESSAGE

        user = db.session.execute(
            select(User)
            .where(User.user_id == reset_token.user_id)
            .with_for_update()
        ).scalar_one_or_none()

        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
        ):
            db.session.rollback()
            return False, INVALID_TOKEN_MESSAGE

        user.password_hash = ph.hash(new_password)
        reset_token.used_at = now
        session_service.apply_revoke_all_sessions(user.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=user.user_id,
            user_id=user.user_id,
            old_value=None,
            new_value={"password_changed": True, "sessions_revoked": True},
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao redefinir a palavra-passe."
        )
        return False, "Não foi possível redefinir a palavra-passe."

    if not email_service.send_password_reset_confirmation_email(user.email):
        logger.warning(
            "Não foi possível enviar a confirmação de recuperação ao utilizador %s.",
            user.user_id,
        )

    return True, "Palavra-passe redefinida com sucesso."
