import secrets
from sqlalchemy import select
from app.extensions import db, ph
from app.models.user import User
from app.models.location import Location
from app.utils.audit import log_action
from app.services.email_service import send_registration_email


def get_all_users() -> list[User]:
    return (
        db.session.execute(
            select(User).where(User.is_active == True).order_by(User.created_at.desc())
        )
        .scalars()
        .all()
    )


def get_pending_users() -> list[User]:
    return (
        db.session.execute(
            select(User)
            .where(User.registration_status == "Pendente")
            .where(User.is_active == True)
            .order_by(User.created_at.asc())
        )
        .scalars()
        .all()
    )


def create_gestor(
    email: str,
    location_ids: list[int],
    admin_id: int,
) -> tuple[bool, str, User | None]:

    existing = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()

    if existing:
        return False, "Já existe um utilizador com este email.", None

    locations = []
    for loc_id in location_ids:

        loc = db.session.execute(
            select(Location).where(
                Location.location_id == loc_id,
                Location.is_active == True,
            )
        ).scalar_one_or_none()

        if not loc:
            return False, f"Sala com id{loc_id} não encontrada ou inativa", None

        locations.append(loc)

    random_password = secrets.token_urlsafe(32)
    password_hash = ph.hash(random_password)

    del random_password

    registration_token = secrets.token_hex(32)

    new_user = User(
        email=email,
        password_hash=password_hash,
        role="Gestor",
        registration_status="Pendente",
        registration_token=registration_token,
    )
    db.session.add(new_user)
    db.session.flush()

    for loc in locations:
        loc.location_manager_id = new_user.user_id

    log_action(
        action="INSERT",
        table_name="users",
        record_id=new_user.user_id,
        user_id=admin_id,
        new_value={
            "email": email,
            "role": "Gestor",
            "registration_status": "Pendente",
            "locations": location_ids,
        },
    )

    db.session.commit()

    email_sent = send_registration_email(email, registration_token)

    if not email_sent:
        return (
            True,
            "Utilizador criado mas o email de registo não foi enviado."
            "Verifique a configuração do servidor de email.",
            new_user,
        )

    return True, "Utilizador criado e email de registo enviado com sucesso.", new_user
