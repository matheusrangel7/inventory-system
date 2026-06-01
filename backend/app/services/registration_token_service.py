import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.constants import REGISTRATION_TOKEN_DAYS
from app.models.user import User


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_registration_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    user.registration_token_hash = hash_token(token)
    user.registration_token_expires_at = now_utc() + timedelta(days=REGISTRATION_TOKEN_DAYS)

    return token


def clear_registration_token(user: User) -> None:
    user.registration_token_hash = None
    user.registration_token_expires_at = None


def is_registration_token_expired(user: User) -> bool:
    return(
        not user.registration_token_expires_at or now_utc() > user.registration_token_expires_at
    )
