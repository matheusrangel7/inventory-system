from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from sqlalchemy import select

from app.extensions import db, ph, DUMMY_ARGON2_HASH
from app.models.user import User
from app.utils.audit import log_action
from app.constants import MIN_PASSWORD_LENGTH


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
        select(User).where(User.registration_token == token)
    ).scalar_one_or_none()

    if not user:
        return False, "Link de registo inválido ou já utilizado.", None

    if user.registration_status == "Concluído":
        return False, "Este registo já foi concluído.", None

    new_hash = ph.hash(new_password)

    old_status = user.registration_status

    user.password_hash = new_hash
    user.registration_status = "Concluído"
    user.registration_token = None

    log_action(
        action="UPDATE",
        table_name="users",
        record_id=user.user_id,
        old_value={"registration_status": old_status},
        new_value={"registration_status": "Concluído"},
    )

    db.session.commit()

    return (
        True,
        "Palavra-passe definida com sucesso. Configure a autenticação MFA para concluir o primeiro acesso.",
        user,
    )
