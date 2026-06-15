import binascii
import re

import pyotp
from sqlalchemy import select

from app.constants import MFA_ISSUER, MFA_VALID_WINDOW
from app.domain.enums import RegistrationStatus
from app.extensions import db
from app.models.user import User
from app.security.totp_secrets import (
    ACTIVE_SECRET_PURPOSE,
    TotpSecretError,
    decrypt_totp_secret,
    encrypt_totp_secret,
)
from app.utils.audit import log_action


def verify_user_totp(user: User, code: str) -> bool:
    if (
        not user.totp_secret_encrypted
        or not re.fullmatch(r"\d{6}", code or "")
    ):
        return False

    try:
        secret = decrypt_totp_secret(
            user.totp_secret_encrypted,
            user.user_id,
            ACTIVE_SECRET_PURPOSE,
        )
        return bool(
            pyotp.TOTP(secret).verify(
                code,
                valid_window=MFA_VALID_WINDOW,
            )
        )
    except (TotpSecretError, binascii.Error, TypeError, ValueError):
        return False


def setup_mfa(user_id: int) -> tuple[bool, str, str | None]:
    user = db.session.get(User, user_id)

    if not user or not user.is_active:
        return False, "Utilizador inválido.", None

    if user.mfa_enabled:
        return False, "MFA já está ativo. Desative primeiro.", None

    secret = pyotp.random_base32()
    otp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name=MFA_ISSUER,
    )

    try:
        user.totp_secret_encrypted = encrypt_totp_secret(
            secret,
            user.user_id,
            ACTIVE_SECRET_PURPOSE,
        )
    except TotpSecretError:
        db.session.rollback()
        return False, "Não foi possível iniciar a configuração MFA.", None

    db.session.commit()

    return True, "QR Code gerado.", otp_uri


def apply_mfa_setup_confirmation(user_id: int, code: str) -> tuple[bool, str]:
    user = db.session.get(User, user_id)

    if not user or not user.is_active:
        return False, "Utilizador inválido."

    if user.mfa_enabled:
        return False, "MFA já está ativo."

    if not user.totp_secret_encrypted:
        return False, "Setup de MFA não iniciado."

    if not verify_user_totp(user, code):
        return False, "Código inválido."

    user.mfa_enabled = True

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        user_id=user.user_id,
        new_value={"mfa_enabled": True},
    )

    return True, "MFA ativado com sucesso."


def _get_session_user_for_update(user_id: int) -> User | None:
    return db.session.execute(
        select(User)
        .where(User.user_id == user_id)
        .with_for_update()
    ).scalar_one_or_none()


def get_enrollment_user_for_session(user_id: int) -> User | None:
    user = _get_session_user_for_update(user_id)
    if (
        not user
        or not user.is_active
        or user.registration_status != RegistrationStatus.COMPLETED
        or not is_mfa_ready(user)
        or not user.mfa_recovery_code_hash
    ):
        db.session.rollback()
        return None
    return user


def verify_mfa(user_id: int, code: str) -> tuple[bool, str, User | None]:
    user = _get_session_user_for_update(user_id)

    if (
        not user
        or not user.is_active
        or user.registration_status != RegistrationStatus.COMPLETED
        or not user.mfa_enabled
        or not user.totp_secret_encrypted
    ):
        db.session.rollback()
        return False, "MFA não configurado para este utilizador.", None

    if not verify_user_totp(user, code):
        db.session.rollback()
        return False, "Código inválido ou expirado.", None

    return True, "MFA verificado.", user


def needs_mfa_enrollment(user: User) -> bool:
    return not user.totp_secret_encrypted or not user.mfa_enabled


def is_mfa_ready(user: User) -> bool:
    return bool(user.totp_secret_encrypted and user.mfa_enabled)
