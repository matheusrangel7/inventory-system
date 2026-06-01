from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from sqlalchemy import select

from app.extensions import db, ph, DUMMY_ARGON2_HASH
from app.models.user import User
from app.utils.audit import log_action
from app.constants import MIN_PASSWORD_LENGTH

from app.services.registration_token_service import (
    clear_registration_token,
    hash_token,
    is_registration_token_expired,
)


def login_user(email: str, password: str) -> tuple[bool, str, User | None]:

    user = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()

    if not user:
        try:
            ph.verify(DUMMY_ARGON2_HASH, password or "invalid-password")
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False, "Credenciais inválidas", None

        return False, "Credenciais inválidas", None

    try:
        ph.verify(user.password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, "Credenciais inválidas", None

    if ph.check_needs_rehash(user.password_hash):
        user.password_hash = ph.hash(password)
        db.session.commit()

    if user.registration_status != "Concluído":
        return False, "O registo ainda não foi concluído. Verifique o seu email.", None

    if not user.is_active:
        return False, "Conta desativada. Contacte o administrador.", None

    return True, "Login bem-sucedido.", user


def get_active_completed_user(user_id: int) -> User | None:
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        return None
    if user.registration_status != "Concluído":
        return None
    return user


def verify_password(user_id: int, password: str) -> tuple[bool, str]:
    user = get_active_completed_user(user_id)
    if not user:
        return False, "Utilizador inválido."

    if user.role != "Administrador":
        return False, "Acesso restrito a administradores."

    try:
        ph.verify(user.password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, "Password incorreta."

    return True, "Password verificada."


def complete_registration(
    token: str, new_password: str
) -> tuple[bool, str, User | None]:
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return (
            False,
            f"A password deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.",
            None,
        )

    user = db.session.execute(
        select(User).where(User.registration_token_hash == hash_token(token))
    ).scalar_one_or_none()

    if not user or not user.is_active:
        return False, "Link de registo inválido ou já utilizado.", None

    if user.registration_status == "Concluído":
        return False, "Este registo já foi concluído.", None

    if is_registration_token_expired(user):
        return False, "Link de registo expirado. Solicite o reenvio.", None

    old_status = user.registration_status

    user.password_hash = ph.hash(new_password)
    user.registration_status = "Concluído"
    clear_registration_token(user)

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        old_value={"registration_status": old_status},
        new_value={
            "registration_status": user.registration_status,
        },
    )

    db.session.commit()

    return (
        True,
        "Palavra-passe definida com sucesso. Configure a autenticação MFA para concluir o primeiro acesso.",
        user,
    )
