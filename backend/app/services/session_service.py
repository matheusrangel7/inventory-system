import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from flask import current_app
from sqlalchemy import select, func
from app.extensions import db
from app.models.user_session import UserSession
from app.constants import MAX_SESSIONS_PER_USER

def create_session(user_id: int, ip: str, user_agent: str) -> str:
    active_count = db.session.execute(
        select(func.count())
        .select_from(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.revoked == False,
            UserSession.expires_at > datetime.now(timezone.utc),
        )
    ).scalar()

    if active_count >= MAX_SESSIONS_PER_USER:
        oldest = db.session.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked == False)
            .order_by(UserSession.created_at.asc())
            .limit(1)
        ).scalar_one()

        oldest.revoked = True
        oldest.revoked_at = datetime.now(timezone.utc)

    refresh_token = secrets.token_urlsafe(64)
    token_hash = _hash_token(refresh_token)

    days = current_app.config.get("REFRESH_TOKEN_EXPIRES_DAYS", 7)
    expires = datetime.now(timezone.utc) + timedelta(days=days)

    session = UserSession(
        user_id=user_id,
        refresh_token_hash=token_hash,
        ip_address=ip,
        user_agent=user_agent,
        expires_at=expires,
    )

    db.session.add(session)
    db.session.commit()

    return refresh_token


def rotate_session(
    old_refresh_token: str, ip: str, user_agent: str
) -> tuple[bool, str, int | None]:
    token_hash = _hash_token(old_refresh_token)

    session = db.session.execute(
        select(UserSession)
        .where(UserSession.refresh_token_hash == token_hash)
        .with_for_update()
    ).scalar_one_or_none()

    if not session:
        return False, "Sessão inválida.", None

    if datetime.now(timezone.utc) > session.expires_at:
        return False, "Sessão expirada. Faça login novamente.", None

    if session.revoked:
        _revoke_all_sessions(session.user_id)
        return False, "Sessão comprometida. Todas as sessões foram encerradas.", None

    session.revoked = True
    session.revoked_at = datetime.now(timezone.utc)
    db.session.flush()

    new_token = create_session(session.user_id, ip, user_agent)

    return True, new_token, session.user_id


def revoke_session(refresh_token: str) -> bool:
    token_hash = _hash_token(refresh_token)

    session = db.session.execute(
        select(UserSession).where(UserSession.refresh_token_hash == token_hash)
    ).scalar_one_or_none()

    if not session or session.revoked:
        return False

    session.revoked = True
    session.revoked_at = datetime.now(timezone.utc)

    db.session.commit()

    return True


def _revoke_all_sessions(user_id: int) -> None:
    sessions = (
        db.session.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.revoked == False,
            )
        )
        .scalars()
        .all()
    )

    now = datetime.now(timezone.utc)

    for s in sessions:
        s.revoked = True
        s.revoked_at = now

    db.session.commit()

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def revoke_all_sessions(user_id: int) -> None:
    _revoke_all_sessions(user_id)