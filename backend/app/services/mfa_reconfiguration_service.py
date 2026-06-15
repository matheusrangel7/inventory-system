import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pyotp
from argon2.exceptions import (
    HashingError,
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.constants import MFA_ISSUER, MFA_VALID_WINDOW, STEP_TOKEN_MINUTES
from app.domain.enums import RegistrationStatus
from app.extensions import db, ph
from app.models.mfa_reconfiguration import MfaReconfiguration
from app.models.user import User
from app.security.totp_secrets import (
    ACTIVE_SECRET_PURPOSE,
    PENDING_SECRET_PURPOSE,
    TotpSecretError,
    decrypt_totp_secret,
    encrypt_totp_secret,
)
from app.services import mfa_recovery_service, mfa_service, session_service
from app.utils.audit import log_action

logger = logging.getLogger(__name__)

INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas."
INVALID_STEP_MESSAGE = "Reconfiguração MFA inválida ou expirada."
INVALID_NEW_CODE_MESSAGE = "Código do novo autenticador inválido ou expirado."


@dataclass(frozen=True)
class ReconfigurationSetup:
    reconfiguration_id: int
    otp_uri: str
    password_fingerprint: str
    totp_fingerprint: str


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _get_user_for_update(user_id: int) -> User | None:
    return db.session.execute(
        select(User)
        .where(User.user_id == user_id)
        .with_for_update()
    ).scalar_one_or_none()


def _get_pending_for_update(
    user_id: int,
    reconfiguration_id: int | None = None,
) -> MfaReconfiguration | None:
    statement = select(MfaReconfiguration).where(
        MfaReconfiguration.user_id == user_id
    )
    if reconfiguration_id is not None:
        statement = statement.where(
            MfaReconfiguration.reconfiguration_id == reconfiguration_id
        )
    return db.session.execute(
        statement.with_for_update()
    ).scalar_one_or_none()


def start_reconfiguration(
    user_id: int,
    current_password: str,
    current_totp_code: str,
) -> tuple[bool, str, ReconfigurationSetup | None]:
    try:
        user = _get_user_for_update(user_id)
        if (
            not user
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
            or not user.mfa_enabled
            or not user.totp_secret_encrypted
        ):
            db.session.rollback()
            return False, INVALID_CONFIRMATION_MESSAGE, None

        try:
            password_valid = ph.verify(user.password_hash, current_password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            password_valid = False

        totp_valid = mfa_service.verify_user_totp(user, current_totp_code)

        if not password_valid or not totp_valid:
            db.session.rollback()
            return False, INVALID_CONFIRMATION_MESSAGE, None

        now = datetime.now(timezone.utc)
        pending_secret = pyotp.random_base32()
        pending = _get_pending_for_update(user.user_id)
        if pending is None:
            pending = MfaReconfiguration(user_id=user.user_id)
            db.session.add(pending)

        pending.pending_totp_secret_encrypted = encrypt_totp_secret(
            pending_secret,
            user.user_id,
            PENDING_SECRET_PURPOSE,
        )
        pending.created_at = now
        pending.expires_at = now + timedelta(minutes=STEP_TOKEN_MINUTES)
        db.session.flush()

        setup = ReconfigurationSetup(
            reconfiguration_id=pending.reconfiguration_id,
            otp_uri=pyotp.TOTP(pending_secret).provisioning_uri(
                name=user.email,
                issuer_name=MFA_ISSUER,
            ),
            password_fingerprint=_fingerprint(user.password_hash),
            totp_fingerprint=_fingerprint(user.totp_secret_encrypted),
        )
        db.session.commit()
        return True, "Identidade confirmada.", setup
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao iniciar reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível iniciar a reconfiguração MFA.", None
    except Exception:
        db.session.rollback()
        logger.exception(
            "Erro inesperado ao iniciar reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível iniciar a reconfiguração MFA.", None


def complete_reconfiguration(
    user_id: int,
    reconfiguration_id: int,
    new_totp_code: str,
    expected_password_fingerprint: str,
    expected_totp_fingerprint: str,
) -> tuple[bool, str, str | None, bool]:
    if not re.fullmatch(r"\d{6}", new_totp_code or ""):
        return False, INVALID_NEW_CODE_MESSAGE, None, True

    try:
        user = _get_user_for_update(user_id)
        pending = _get_pending_for_update(user_id, reconfiguration_id)
        now = datetime.now(timezone.utc)

        if (
            not user
            or not pending
            or not user.is_active
            or user.registration_status != RegistrationStatus.COMPLETED
            or not user.mfa_enabled
            or not user.totp_secret_encrypted
            or pending.expires_at <= now
            or not hmac.compare_digest(
                _fingerprint(user.password_hash),
                expected_password_fingerprint,
            )
            or not hmac.compare_digest(
                _fingerprint(user.totp_secret_encrypted),
                expected_totp_fingerprint,
            )
        ):
            db.session.rollback()
            return False, INVALID_STEP_MESSAGE, None, False

        try:
            pending_secret = decrypt_totp_secret(
                pending.pending_totp_secret_encrypted,
                user.user_id,
                PENDING_SECRET_PURPOSE,
            )
            code_valid = pyotp.TOTP(pending_secret).verify(
                new_totp_code,
                valid_window=MFA_VALID_WINDOW,
            )
        except (TotpSecretError, TypeError, ValueError):
            db.session.rollback()
            return False, INVALID_STEP_MESSAGE, None, False

        if not code_valid:
            db.session.rollback()
            return False, INVALID_NEW_CODE_MESSAGE, None, True

        user.totp_secret_encrypted = encrypt_totp_secret(
            pending_secret,
            user.user_id,
            ACTIVE_SECRET_PURPOSE,
        )
        recovery_code = mfa_recovery_service.apply_recovery_code(user.user_id)
        if recovery_code is None:
            db.session.rollback()
            return False, "Não foi possível concluir a reconfiguração MFA.", None, True

        session_service.apply_revoke_all_sessions(user.user_id)
        log_action(
            action="UPDATE",
            table_name="users",
            record_id=user.user_id,
            user_id=user.user_id,
            old_value={"mfa_enabled": True},
            new_value={
                "mfa_enabled": True,
                "mfa_reconfigured": True,
                "recovery_code_rotated": True,
                "sessions_revoked": True,
            },
        )
        db.session.delete(pending)
        db.session.commit()
    except (HashingError, SQLAlchemyError, TotpSecretError):
        db.session.rollback()
        logger.exception(
            "Erro ao concluir reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível concluir a reconfiguração MFA.", None, True
    except Exception:
        db.session.rollback()
        logger.exception(
            "Erro inesperado ao concluir reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível concluir a reconfiguração MFA.", None, True

    return True, "Autenticador reconfigurado com sucesso.", recovery_code, False


def cancel_reconfiguration(user_id: int) -> tuple[bool, str]:
    try:
        user = _get_user_for_update(user_id)
        if not user:
            db.session.rollback()
            return False, "Utilizador inválido."

        pending = _get_pending_for_update(user_id)
        if pending is not None:
            db.session.delete(pending)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro ao cancelar reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível cancelar a reconfiguração MFA."
    except Exception:
        db.session.rollback()
        logger.exception(
            "Erro inesperado ao cancelar reconfiguração MFA do utilizador %s.",
            user_id,
        )
        return False, "Não foi possível cancelar a reconfiguração MFA."

    return True, "Reconfiguração MFA cancelada."
