import pyotp
from app.extensions import db
from app.models.user import User
from app.utils.audit import log_action
from app.constants import MFA_ISSUER, MFA_VALID_WINDOW


def setup_mfa(user_id: int) -> tuple[bool, str, str | None, str | None]:
    user = db.session.get(User, user_id)

    if not user or not user.is_active:
        return False, "Utilizador inválido.", None, None

    if user.mfa_enabled:
        return False, "MFA já está ativo. Desative primeiro.", None, None

    secret = pyotp.random_base32()
    otp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name=MFA_ISSUER,
    )

    user.totp_secret = secret

    db.session.commit()

    return True, "QR Code gerado.", secret, otp_uri


def apply_mfa_setup_confirmation(user_id: int, code: str) -> tuple[bool, str]:
    user = db.session.get(User, user_id)

    if not user or not user.is_active:
        return False, "Utilizador inválido."

    if not user.totp_secret:
        return False, "Setup de MFA não iniciado."

    totp = pyotp.TOTP(user.totp_secret)

    if not totp.verify(code, valid_window=MFA_VALID_WINDOW):
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


def confirm_mfa_setup(user_id: int, code: str) -> tuple[bool, str]:
    ok, message = apply_mfa_setup_confirmation(user_id, code)
    if ok:
        db.session.commit()
    return ok, message


def verify_mfa(user_id: int, code: str) -> tuple[bool, str]:
    user = db.session.get(User, user_id)

    if not user or not user.mfa_enabled or not user.totp_secret:
        return False, "MFA não configurado para este utilizador."

    totp = pyotp.TOTP(user.totp_secret)

    if not totp.verify(code, valid_window=MFA_VALID_WINDOW):
        return False, "Código inválido ou expirado."

    return True, "MFA verificado."


def needs_mfa_enrollment(user: User) -> bool:
    return not user.totp_secret or not user.mfa_enabled


def is_mfa_ready(user: User) -> bool:
    return bool(user.totp_secret and user.mfa_enabled)
