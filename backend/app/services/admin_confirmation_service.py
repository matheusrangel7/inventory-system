from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select

from app.domain.enums import RegistrationStatus, UserRole
from app.extensions import db, ph
from app.models.user import User
from app.services import mfa_service

INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas."


def confirm_administrator(
    administrator_id: int,
    password: str,
    totp_code: str,
) -> tuple[bool, str, User | None]:
    administrator = db.session.execute(
        select(User)
        .where(User.user_id == administrator_id)
        .with_for_update()
    ).scalar_one_or_none()

    if (
        not administrator
        or not administrator.is_active
        or administrator.registration_status != RegistrationStatus.COMPLETED
        or administrator.role != UserRole.ADMINISTRATOR
        or not administrator.mfa_enabled
        or not administrator.totp_secret_encrypted
    ):
        db.session.rollback()
        return False, INVALID_CONFIRMATION_MESSAGE, None

    try:
        password_valid = ph.verify(administrator.password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError, TypeError):
        password_valid = False

    totp_valid = mfa_service.verify_user_totp(administrator, totp_code)
    if not password_valid or not totp_valid:
        db.session.rollback()
        return False, INVALID_CONFIRMATION_MESSAGE, None

    return True, "Credenciais confirmadas.", administrator
