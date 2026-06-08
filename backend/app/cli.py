import click
from sqlalchemy import select

from app.constants import MIN_PASSWORD_LENGTH
from app.extensions import db, ph
from app.models.user import User
from app.utils.audit import log_action


@click.command("bootstrap-admin")
def bootstrap_admin() -> None:
    existing_admin = db.session.execute(
        select(User).where(
            User.role == "Administrador",
            User.registration_status == "Concluído",
            User.is_active == True,
        )
    ).scalar_one_or_none()
    if existing_admin:
        raise click.ClickException("Já existe um Administrador ativo.")

    email = click.prompt("Email do Administrador").strip().lower()
    password = click.prompt(
        "Password",
        hide_input=True,
        confirmation_prompt=True,
    )
    if not email or "@" not in email:
        raise click.ClickException("Email inválido.")
    minimum_length = MIN_PASSWORD_LENGTH
    if len(password) < minimum_length:
        raise click.ClickException(
            f"A password deve ter pelo menos {minimum_length} caracteres."
        )

    existing_user = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if existing_user:
        raise click.ClickException("Já existe um utilizador com esse email.")

    admin = User(
        email=email,
        password_hash=ph.hash(password),
        role="Administrador",
        registration_status="Concluído",
        mfa_enabled=False,
        is_active=True,
    )
    db.session.add(admin)
    db.session.flush()
    log_action(
        action="INSERT",
        table_name="users",
        record_id=admin.user_id,
        user_id=admin.user_id,
        origin="bootstrap_cli",
        new_value={
            "email": admin.email,
            "role": admin.role,
            "registration_status": admin.registration_status,
        },
    )
    db.session.commit()
    click.echo("Administrador criado. O MFA será configurado no primeiro login.")
