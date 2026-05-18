import secrets
import bcrypt
from sqlalchemy import select
from app.extensions import db
from app.models.user import User
from app.utils.audit import log_action


def login_user(email: str, password: str) -> tuple[bool, str, User | None]:

    user = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()

    if not user:
        bcrypt.checkpw(b"dummy", bcrypt.hashpw(b"dummy", bcrypt.gensalt(12)))
        return False, "Credenciais inválidas", None

    password_ok = bcrypt.checkpw(
        password.encode("utf-8"),
        user.password_hash.encode("utf-8"),
    )

    if not password_ok:
        return False, "Credenciais inválidas", None

    if user.registration_status != "Concluído":
        return False, "O registo ainda não foi concluído. Verifique o seu email.", None

    if not user.is_active:
        return False, "Conta desativada. Contacte o administrador.", None

    return True, "Login bem-sucedido.", user


def complete_registration(token: str, new_password: str) -> tuple[bool, str]:
    user = db.session.execute(
        select(User).where(User.registration_token == token)
    ).scalar_one_or_none()

    if not user:
        return False, "Link de registo inválido ou já utilizado."

    if user.registration_status == "Concluído":
        return False, "Este registo já foi concluído."

    new_hash = bcrypt.hashpw(
        new_password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")

    old_status = user.registration_status

    user.password_hash = new_hash
    user.registration_status = "Concluído"
    user.registration_token = None

    log_action(
        action="UPDATE",
        table_name="users",
        record_id="user.user_id",
        old_value={"registration_status": old_status},
        new_value={"regisration_status": "Concluído"},
    )

    db.session.commit()
    return True, "Registo concluído com sucesso. Já pode fazer login."
