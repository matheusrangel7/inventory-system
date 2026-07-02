from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.domain.enums import RegistrationStatus
from app.services import password_reset_service


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return FakeScalars(self.value)


class FakeSession:
    def __init__(self, results):
        self.results = iter(results)
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        return FakeResult(next(self.results))

    def add(self, value):
        self.added.append(value)

    def delete(self, value):
        self.deleted.append(value)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_user():
    return SimpleNamespace(
        user_id=7,
        email="utilizador@ubi.pt",
        password_hash="old-hash",
        is_active=True,
        registration_status=RegistrationStatus.COMPLETED,
    )


def make_reset_token(**overrides):
    now = datetime.now(timezone.utc)
    values = {
        "reset_token_id": 3,
        "user_id": 7,
        "token_hash": "old-token-hash",
        "created_at": now - timedelta(minutes=5),
        "expires_at": now + timedelta(minutes=25),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_request_returns_same_message_for_unknown_user(monkeypatch):
    session = FakeSession([None])
    sent = []
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service.email_service,
        "send_password_reset_email",
        lambda email, token: sent.append((email, token)),
    )

    message = password_reset_service.request_password_reset("missing@ubi.pt")

    assert message == password_reset_service.GENERIC_REQUEST_MESSAGE
    assert sent == []


def test_new_request_reuses_existing_user_record(monkeypatch):
    user = make_user()
    reset_token = make_reset_token()
    session = FakeSession([user, reset_token])
    sent = []
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service.secrets,
        "token_urlsafe",
        lambda length: "new-raw-token",
    )
    monkeypatch.setattr(
        password_reset_service.email_service,
        "send_password_reset_email",
        lambda email, token: sent.append((email, token)) or True,
    )

    message = password_reset_service.request_password_reset(user.email)

    assert message == password_reset_service.GENERIC_REQUEST_MESSAGE
    assert session.added == []
    assert session.committed
    assert reset_token.token_hash == password_reset_service._hash_token(
        "new-raw-token"
    )
    assert sent == [(user.email, "new-raw-token")]


def test_issue_password_reset_token_does_not_commit_or_send_email(monkeypatch):
    user = make_user()
    reset_token = make_reset_token()
    session = FakeSession([reset_token])
    sent = []
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service.secrets,
        "token_urlsafe",
        lambda length: "transaction-owned-token",
    )
    monkeypatch.setattr(
        password_reset_service.email_service,
        "send_password_reset_email",
        lambda *args: sent.append(args),
    )

    raw_token = password_reset_service.issue_password_reset_token(user)

    assert raw_token == "transaction-owned-token"
    assert reset_token.token_hash == password_reset_service._hash_token(raw_token)
    assert not session.committed
    assert sent == []


def test_complete_reset_changes_password_and_revokes_sessions(monkeypatch):
    user = make_user()
    reset_token = make_reset_token(
        token_hash=password_reset_service._hash_token("valid-token")
    )
    active_sessions = [
        SimpleNamespace(revoked=False, revoked_at=None),
        SimpleNamespace(revoked=False, revoked_at=None),
    ]
    session = FakeSession([reset_token, user, active_sessions])
    audit_calls = []
    confirmation_calls = []

    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: False,
            hash=lambda password: f"hashed:{password}",
        ),
    )
    monkeypatch.setattr(
        password_reset_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )
    monkeypatch.setattr(
        password_reset_service.email_service,
        "send_password_reset_confirmation_email",
        lambda email: confirmation_calls.append(email) or True,
    )

    ok, message = password_reset_service.complete_password_reset(
        "valid-token",
        "NovaPassword1",
    )

    assert ok
    assert message == "Palavra-passe redefinida com sucesso."
    assert user.password_hash == "hashed:NovaPassword1"
    assert session.deleted == [reset_token]
    assert all(item.revoked and item.revoked_at for item in active_sessions)
    assert session.committed
    assert audit_calls[0]["new_value"] == {
        "password_changed": True,
        "sessions_revoked": True,
    }
    assert confirmation_calls == [user.email]


def test_complete_reset_rejects_current_password(monkeypatch):
    user = make_user()
    reset_token = make_reset_token(
        token_hash=password_reset_service._hash_token("valid-token")
    )
    session = FakeSession([reset_token, user])

    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_reset_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: True,
            hash=lambda password: (_ for _ in ()).throw(
                AssertionError("password must not be rehashed")
            ),
        ),
    )
    monkeypatch.setattr(
        password_reset_service.session_service,
        "apply_revoke_all_sessions",
        lambda user_id: (_ for _ in ()).throw(
            AssertionError("sessions must not be revoked")
        ),
    )
    monkeypatch.setattr(
        password_reset_service,
        "log_action",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("audit log must not be created")
        ),
    )
    monkeypatch.setattr(
        password_reset_service.email_service,
        "send_password_reset_confirmation_email",
        lambda email: (_ for _ in ()).throw(
            AssertionError("email must not be sent")
        ),
    )

    ok, message = password_reset_service.complete_password_reset(
        "valid-token",
        "PasswordAtual1",
    )

    assert not ok
    assert message == "A nova palavra-passe deve ser diferente da atual."
    assert user.password_hash == "old-hash"
    assert session.deleted == []
    assert session.rolled_back
    assert not session.committed


def test_deleted_token_cannot_be_reused(monkeypatch):
    session = FakeSession([None])
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = password_reset_service.complete_password_reset(
        "used-token",
        "NovaPassword1",
    )

    assert not ok
    assert message == password_reset_service.INVALID_TOKEN_MESSAGE
    assert session.rolled_back
    assert not session.committed


def test_expired_token_cannot_be_used(monkeypatch):
    reset_token = make_reset_token(
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    session = FakeSession([reset_token])
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = password_reset_service.complete_password_reset(
        "expired-token",
        "NovaPassword1",
    )

    assert not ok
    assert message == password_reset_service.INVALID_TOKEN_MESSAGE
    assert session.rolled_back


def test_invalid_password_does_not_query_token(monkeypatch):
    session = FakeSession([])
    monkeypatch.setattr(
        password_reset_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = password_reset_service.complete_password_reset(
        "valid-token",
        "semnumero",
    )

    assert not ok
    assert "número" in message
    assert not session.committed
