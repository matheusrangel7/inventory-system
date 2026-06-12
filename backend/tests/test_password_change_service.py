from types import SimpleNamespace

import pytest
from argon2.exceptions import HashingError, VerifyMismatchError
from sqlalchemy.exc import SQLAlchemyError

from app.domain.enums import RegistrationStatus
from app.services import password_change_service


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
        self.statements = []
        self.added = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        self.statements.append(statement)
        return FakeResult(next(self.results))

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_user(**overrides):
    values = {
        "user_id": 7,
        "email": "utilizador@ubi.pt",
        "password_hash": "current-hash",
        "is_active": True,
        "registration_status": RegistrationStatus.COMPLETED,
        "mfa_enabled": True,
        "totp_secret": "totp-secret",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def install_session(monkeypatch, session):
    monkeypatch.setattr(
        password_change_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        password_change_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )


def test_confirm_identity_validates_both_factors_and_releases_lock(monkeypatch):
    user = make_user()
    session = FakeSession([user])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(verify=lambda password_hash, password: password == "Password1"),
    )
    monkeypatch.setattr(
        password_change_service.pyotp,
        "TOTP",
        lambda secret: SimpleNamespace(
            verify=lambda code, valid_window: code == "123456"
        ),
    )

    ok, message, fingerprint = password_change_service.confirm_identity(
        user.user_id,
        "Password1",
        "123456",
    )

    assert ok
    assert message == "Identidade confirmada."
    assert fingerprint == password_change_service.password_fingerprint(
        user.password_hash
    )
    assert session.statements[0]._for_update_arg is not None
    assert session.rolled_back
    assert not session.committed


@pytest.mark.parametrize(
    ("password_valid", "totp_code"),
    [
        (False, "123456"),
        (True, "654321"),
        (True, "12A456"),
        (True, ""),
    ],
)
def test_confirm_identity_uses_generic_failure_for_either_factor(
    monkeypatch,
    password_valid,
    totp_code,
):
    user = make_user()
    session = FakeSession([user])
    install_session(monkeypatch, session)

    def verify_password(password_hash, password):
        if password_valid:
            return True
        raise VerifyMismatchError

    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(verify=verify_password),
    )
    monkeypatch.setattr(
        password_change_service.pyotp,
        "TOTP",
        lambda secret: SimpleNamespace(
            verify=lambda code, valid_window: code == "123456"
        ),
    )

    ok, message, fingerprint = password_change_service.confirm_identity(
        user.user_id,
        "Password1",
        totp_code,
    )

    assert not ok
    assert message == password_change_service.INVALID_CONFIRMATION_MESSAGE
    assert fingerprint is None
    assert session.rolled_back


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_active": False},
        {"registration_status": RegistrationStatus.PENDING},
        {"mfa_enabled": False},
        {"totp_secret": None},
    ],
)
def test_confirm_identity_rejects_invalid_account_state(monkeypatch, overrides):
    session = FakeSession([make_user(**overrides)])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda *args: pytest.fail("password must not be verified")
        ),
    )

    ok, message, fingerprint = password_change_service.confirm_identity(
        7,
        "Password1",
        "123456",
    )

    assert not ok
    assert message == password_change_service.INVALID_CONFIRMATION_MESSAGE
    assert fingerprint is None
    assert session.rolled_back


def test_confirm_identity_rejects_corrupted_totp_secret_generically(monkeypatch):
    user = make_user(totp_secret="invalid-secret")
    session = FakeSession([user])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(verify=lambda password_hash, password: True),
    )
    monkeypatch.setattr(
        password_change_service.pyotp,
        "TOTP",
        lambda secret: SimpleNamespace(
            verify=lambda code, valid_window: (_ for _ in ()).throw(
                password_change_service.binascii.Error("invalid base32")
            )
        ),
    )

    ok, message, fingerprint = password_change_service.confirm_identity(
        user.user_id,
        "Password1",
        "123456",
    )

    assert not ok
    assert message == password_change_service.INVALID_CONFIRMATION_MESSAGE
    assert fingerprint is None
    assert session.rolled_back


def test_complete_password_change_updates_hash_revokes_sessions_and_audits(
    monkeypatch,
):
    user = make_user()
    active_sessions = [
        SimpleNamespace(revoked=False, revoked_at=None),
        SimpleNamespace(revoked=False, revoked_at=None),
    ]
    session = FakeSession([user, active_sessions])
    install_session(monkeypatch, session)
    audit_calls = []
    email_calls = []
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: False,
            hash=lambda password: f"hashed:{password}",
        ),
    )
    monkeypatch.setattr(
        password_change_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )
    monkeypatch.setattr(
        password_change_service.email_service,
        "send_password_change_confirmation_email",
        lambda email: email_calls.append(email) or True,
    )

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            user.user_id,
            "NovaPassword1",
            password_change_service.password_fingerprint(user.password_hash),
        )
    )

    assert ok
    assert message == "Palavra-passe alterada com sucesso."
    assert not confirmation_valid
    assert user.password_hash == "hashed:NovaPassword1"
    assert all(item.revoked and item.revoked_at for item in active_sessions)
    assert session.committed
    assert session.statements[0]._for_update_arg is not None
    assert audit_calls[0]["new_value"] == {
        "password_changed": True,
        "sessions_revoked": True,
    }
    assert email_calls == [user.email]


def test_complete_rejects_stale_fingerprint_before_changing_state(monkeypatch):
    user = make_user()
    session = FakeSession([user])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda *args: pytest.fail("new password must not be checked")
        ),
    )

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            user.user_id,
            "NovaPassword1",
            "stale-fingerprint",
        )
    )

    assert not ok
    assert message == password_change_service.INVALID_STEP_MESSAGE
    assert not confirmation_valid
    assert user.password_hash == "current-hash"
    assert session.rolled_back
    assert not session.committed


def test_complete_rejects_current_password_without_revoking_sessions(monkeypatch):
    user = make_user()
    session = FakeSession([user])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(verify=lambda password_hash, password: True),
    )

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            user.user_id,
            "Password1",
            password_change_service.password_fingerprint(user.password_hash),
        )
    )

    assert not ok
    assert message == "A nova palavra-passe deve ser diferente da atual."
    assert confirmation_valid
    assert session.rolled_back
    assert len(session.statements) == 1


def test_complete_rejects_weak_password_before_locking_user(monkeypatch):
    session = FakeSession([])
    install_session(monkeypatch, session)

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            7,
            "semnumero",
            "fingerprint",
        )
    )

    assert not ok
    assert "número" in message
    assert confirmation_valid
    assert session.statements == []


def test_email_failure_does_not_rollback_completed_change(monkeypatch):
    user = make_user()
    session = FakeSession([user, []])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: False,
            hash=lambda password: f"hashed:{password}",
        ),
    )
    monkeypatch.setattr(password_change_service, "log_action", lambda **kwargs: None)
    monkeypatch.setattr(
        password_change_service.email_service,
        "send_password_change_confirmation_email",
        lambda email: False,
    )

    ok, _, _ = password_change_service.complete_password_change(
        user.user_id,
        "NovaPassword1",
        password_change_service.password_fingerprint(user.password_hash),
    )

    assert ok
    assert session.committed
    assert user.password_hash == "hashed:NovaPassword1"


def test_complete_rolls_back_and_skips_email_when_commit_fails(monkeypatch):
    user = make_user()
    session = FakeSession([user, []])
    install_session(monkeypatch, session)
    email_calls = []

    def fail_commit():
        raise SQLAlchemyError("commit failed")

    session.commit = fail_commit
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: False,
            hash=lambda password: f"hashed:{password}",
        ),
    )
    monkeypatch.setattr(password_change_service, "log_action", lambda **kwargs: None)
    monkeypatch.setattr(
        password_change_service.email_service,
        "send_password_change_confirmation_email",
        lambda email: email_calls.append(email) or True,
    )

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            user.user_id,
            "NovaPassword1",
            password_change_service.password_fingerprint(user.password_hash),
        )
    )

    assert not ok
    assert message == "Não foi possível alterar a palavra-passe."
    assert confirmation_valid
    assert session.rolled_back
    assert email_calls == []


def test_complete_rolls_back_when_password_hashing_fails(monkeypatch):
    user = make_user()
    session = FakeSession([user])
    install_session(monkeypatch, session)
    monkeypatch.setattr(
        password_change_service,
        "ph",
        SimpleNamespace(
            verify=lambda password_hash, password: False,
            hash=lambda password: (_ for _ in ()).throw(
                HashingError("hash failed")
            ),
        ),
    )

    ok, message, confirmation_valid = (
        password_change_service.complete_password_change(
            user.user_id,
            "NovaPassword1",
            password_change_service.password_fingerprint(user.password_hash),
        )
    )

    assert not ok
    assert message == "Não foi possível alterar a palavra-passe."
    assert confirmation_valid
    assert session.rolled_back
    assert not session.committed
