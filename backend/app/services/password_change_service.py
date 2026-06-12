import binascii
import hashlib
import hmac
import logging
import re

import pyotp
from argon2.exceptions import (
    HashingError,
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.constants import MFA_VALID_WINDOW
from app.domain.enums import RegistrationStatus
from app.extensions import db, ph
from app.models.user import User
from app.services import email_service, session_service
from app.services.password_service import validate_password
from app.utils.audit import log_action

logger = logging.getLogger(__name__)

INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas."
INVALID_STEP_MESSAGE = "Confirmação inválida ou expirada."


def password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()


def _get_user_for_update(user_id: int) -> User | None:
    return db.session.execute(
        select(User)
        .where(User.user_id == user_id)
        .with_for_update()
    ).scalar_one_or_none()


def confirm_identity(
    user_id: int,
    current_password: str,
    totp_code: str,
) -> tuple[bool, str, str | None]:
    try:
        user = _get_user_for_update(user_id)
        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
            or not user.mfa_enabled
            or not user.totp_secret
        ):
            db.session.rollback()
            return False, INVALID_CONFIRMATION_MESSAGE, None

        try:
            password_valid = ph.verify(user.password_hash, current_password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            password_valid = False

        try:
            totp_valid = bool(
                re.fullmatch(r"\d{6}", totp_code or "")
                and pyotp.TOTP(user.totp_secret).verify(
                    totp_code,
                    valid_window=MFA_VALID_WINDOW,
                )
            )
        except (binascii.Error, TypeError, ValueError):
            totp_valid = False
        if not password_valid or not totp_valid:
            db.session.rollback()
            return False, INVALID_CONFIRMATION_MESSAGE, None

        fingerprint = password_fingerprint(user.password_hash)
        db.session.rollback()
        return True, "Identidade confirmada.", fingerprint
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Erro de base de dados ao confirmar alteração de password.")
        return False, "Não foi possível confirmar a alteração.", None


def complete_password_change(
    user_id: int,
    new_password: str,
    expected_fingerprint: str,
) -> tuple[bool, str, bool]:
    password_ok, password_message = validate_password(new_password)
    if not password_ok:
        return False, password_message, True

    try:
        user = _get_user_for_update(user_id)
        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
            or not hmac.compare_digest(
                password_fingerprint(user.password_hash),
                expected_fingerprint,
            )
        ):
            db.session.rollback()
            return False, INVALID_STEP_MESSAGE, False

        try:
            password_unchanged = ph.verify(user.password_hash, new_password)
        except VerifyMismatchError:
            password_unchanged = False
        except (VerificationError, InvalidHashError):
            db.session.rollback()
            logger.error(
                "Hash de password inválido ao alterar password do utilizador %s.",
                user.user_id,
            )
            return False, "Não foi possível alterar a palavra-passe.", True

        if password_unchanged:
            db.session.rollback()
            return (
                False,
                "A nova palavra-passe deve ser diferente da atual.",
                True,
            )

        try:
            user.password_hash = ph.hash(new_password)
        except HashingError:
            db.session.rollback()
            logger.exception(
                "Erro ao gerar novo hash para o utilizador %s.",
                user.user_id,
            )
            return False, "Não foi possível alterar a palavra-passe.", True

        session_service.apply_revoke_all_sessions(user.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=user.user_id,
            user_id=user.user_id,
            old_value=None,
            new_value={"password_changed": True, "sessions_revoked": True},
        )
        email = user.email
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Erro de base de dados ao alterar a password.")
        return False, "Não foi possível alterar a palavra-passe.", True

    if not email_service.send_password_change_confirmation_email(email):
        logger.warning(
            "Não foi possível enviar confirmação de alteração ao utilizador %s.",
            user_id,
        )

    return True, "Palavra-passe alterada com sucesso.", False
