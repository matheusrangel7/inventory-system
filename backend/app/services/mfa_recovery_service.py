import logging
import secrets

from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.constants import MFA_RECOVERY_CODE_LENGTH
from app.domain.enums import RegistrationStatus
from app.extensions import db, ph
from app.models.user import User
from app.services import email_service, session_service
from app.utils.audit import log_action

RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVALID_RECOVERY_CODE_MESSAGE = "Código de recuperação inválido."
logger = logging.getLogger(__name__)


def normalize_recovery_code(code: str) -> str:
    return "".join(
        character
        for character in str(code or "").upper()
        if character not in {"-", " "}
    )


def generate_recovery_code() -> str:
    normalized = "".join(
        secrets.choice(RECOVERY_CODE_ALPHABET)
        for _ in range(MFA_RECOVERY_CODE_LENGTH)
    )
    return "-".join(
        normalized[index : index + 4]
        for index in range(0, len(normalized), 4)
    )


def apply_recovery_code(user_id: int) -> str | None:
    user = db.session.get(User, user_id)
    if not user or not user.is_active or not user.mfa_enabled:
        return None

    recovery_code = generate_recovery_code()
    user.mfa_recovery_code_hash = ph.hash(
        normalize_recovery_code(recovery_code)
    )
    return recovery_code


def has_recovery_code(user: User) -> bool:
    return bool(user.mfa_recovery_code_hash)


def recover_authenticator(user_id: int, code: str) -> tuple[bool, str]:
    normalized_code = normalize_recovery_code(code)
    if len(normalized_code) != MFA_RECOVERY_CODE_LENGTH:
        return False, INVALID_RECOVERY_CODE_MESSAGE

    try:
        user = db.session.execute(
            select(User)
            .where(User.user_id == user_id)
            .with_for_update()
        ).scalar_one_or_none()

        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
            or not user.mfa_enabled
            or not user.totp_secret_encrypted
            or not user.mfa_recovery_code_hash
        ):
            db.session.rollback()
            return False, INVALID_RECOVERY_CODE_MESSAGE

        try:
            ph.verify(user.mfa_recovery_code_hash, normalized_code)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            db.session.rollback()
            return False, INVALID_RECOVERY_CODE_MESSAGE

        user.totp_secret_encrypted = None
        user.mfa_enabled = False
        user.mfa_recovery_code_hash = None
        session_service.apply_revoke_all_sessions(user.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=user.user_id,
            user_id=user.user_id,
            old_value={"mfa_enabled": True},
            new_value={
                "mfa_enabled": False,
                "mfa_recovery_used": True,
                "sessions_revoked": True,
            },
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return False, "Não foi possível recuperar o acesso ao autenticador."

    if not email_service.send_mfa_recovery_email(user.email):
        logger.warning(
            "Não foi possível enviar notificação de recuperação MFA ao utilizador %s.",
            user.user_id,
        )

    return True, "Autenticador desvinculado com sucesso."
