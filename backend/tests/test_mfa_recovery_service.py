from types import SimpleNamespace

from argon2.exceptions import VerifyMismatchError
from sqlalchemy.exc import SQLAlchemyError

from app.domain.enums import RegistrationStatus
from app.services import mfa_recovery_service, mfa_service


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
    def __init__(self, results=None, user=None):
        self.results = iter(results or [])
        self.user = user
        self.statements = []
        self.committed = False
        self.rolled_back = False

    def get(self, model, user_id):
        return self.user

    def execute(self, statement):
        self.statements.append(statement)
        return FakeResult(next(self.results))

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_user():
    return SimpleNamespace(
        user_id=7,
        email="user@example.com",
        is_active=True,
        registration_status=RegistrationStatus.COMPLETED,
        totp_secret_encrypted="totp-secret",
        mfa_enabled=True,
        mfa_recovery_code_hash="argon-hash",
    )


def test_generate_recovery_code_has_expected_format(monkeypatch):
    characters = iter("ABCDEFGHJKLMNPQR")
    monkeypatch.setattr(
        mfa_recovery_service.secrets,
        "choice",
        lambda alphabet: next(characters),
    )

    code = mfa_recovery_service.generate_recovery_code()

    assert code == "ABCD-EFGH-JKLM-NPQR"
    assert mfa_recovery_service.normalize_recovery_code(code) == (
        "ABCDEFGHJKLMNPQR"
    )


def test_normalize_recovery_code_accepts_spaces_and_lowercase():
    assert mfa_recovery_service.normalize_recovery_code(
        "abcd efgh-jklm npqr"
    ) == "ABCDEFGHJKLMNPQR"


def test_apply_recovery_code_stores_only_hash(monkeypatch):
    user = make_user()
    session = FakeSession(user=user)
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "generate_recovery_code",
        lambda: "ABCD-EFGH-JKLM-NPQR",
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "ph",
        SimpleNamespace(hash=lambda value: f"hashed:{value}"),
    )

    code = mfa_recovery_service.apply_recovery_code(user.user_id)

    assert code == "ABCD-EFGH-JKLM-NPQR"
    assert user.mfa_recovery_code_hash == "hashed:ABCDEFGHJKLMNPQR"
    assert code not in user.mfa_recovery_code_hash


def test_confirmed_mfa_cannot_generate_another_recovery_code(monkeypatch):
    user = make_user()
    session = FakeSession(user=user)
    monkeypatch.setattr(
        mfa_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = mfa_service.apply_mfa_setup_confirmation(
        user.user_id,
        "123456",
    )

    assert not ok
    assert message == "MFA já está ativo."


def test_mfa_verification_locks_user_until_session_is_created(monkeypatch):
    user = make_user()
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_service.pyotp,
        "TOTP",
        lambda secret: SimpleNamespace(verify=lambda code, valid_window: True),
    )
    monkeypatch.setattr(
        mfa_service,
        "decrypt_totp_secret",
        lambda envelope, user_id, purpose: "totp-secret",
    )

    ok, message, verified_user = mfa_service.verify_mfa(
        user.user_id,
        "123456",
    )

    assert ok
    assert message == "MFA verificado."
    assert verified_user is user
    assert session.statements[0]._for_update_arg is not None
    assert not session.committed
    assert not session.rolled_back


def test_enrollment_completion_locks_ready_user_until_session_is_created(
    monkeypatch,
):
    user = make_user()
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_service,
        "db",
        SimpleNamespace(session=session),
    )

    enrolled_user = mfa_service.get_enrollment_user_for_session(user.user_id)

    assert enrolled_user is user
    assert session.statements[0]._for_update_arg is not None
    assert not session.committed
    assert not session.rolled_back


def test_recover_authenticator_consumes_code_and_revokes_sessions(monkeypatch):
    user = make_user()
    sessions = [
        SimpleNamespace(revoked=False, revoked_at=None),
        SimpleNamespace(revoked=False, revoked_at=None),
    ]
    session = FakeSession(results=[user, sessions])
    audit_calls = []
    notifications = []
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "ph",
        SimpleNamespace(
            verify=lambda stored_hash, value: (
                stored_hash == "argon-hash"
                and value == "ABCDEFGHJKLMNPQR"
            )
        ),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )
    monkeypatch.setattr(
        mfa_recovery_service.email_service,
        "send_mfa_recovery_email",
        lambda email: notifications.append((session.committed, email)) or True,
    )

    ok, message = mfa_recovery_service.recover_authenticator(
        user.user_id,
        "abcd-efgh-jklm-npqr",
    )

    assert ok
    assert message == "Autenticador desvinculado com sucesso."
    assert user.totp_secret_encrypted is None
    assert user.mfa_enabled is False
    assert user.mfa_recovery_code_hash is None
    assert all(item.revoked and item.revoked_at for item in sessions)
    assert session.committed
    assert notifications == [(True, user.email)]
    assert audit_calls[0]["new_value"] == {
        "mfa_enabled": False,
        "mfa_recovery_used": True,
        "sessions_revoked": True,
    }
    assert "recovery_code" not in str(audit_calls)


def test_recovery_email_failure_does_not_rollback_successful_recovery(monkeypatch):
    user = make_user()
    sessions = [SimpleNamespace(revoked=False, revoked_at=None)]
    session = FakeSession(results=[user, sessions])
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "ph",
        SimpleNamespace(verify=lambda stored_hash, value: True),
    )
    monkeypatch.setattr(mfa_recovery_service, "log_action", lambda **kwargs: None)
    monkeypatch.setattr(
        mfa_recovery_service.email_service,
        "send_mfa_recovery_email",
        lambda email: False,
    )

    ok, _ = mfa_recovery_service.recover_authenticator(
        user.user_id,
        "ABCD-EFGH-JKLM-NPQR",
    )

    assert ok
    assert session.committed
    assert not session.rolled_back
    assert user.totp_secret_encrypted is None
    assert user.mfa_enabled is False


def test_recovery_does_not_notify_when_transaction_fails(monkeypatch):
    user = make_user()
    sessions = [SimpleNamespace(revoked=False, revoked_at=None)]
    session = FakeSession(results=[user, sessions])
    notifications = []
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "ph",
        SimpleNamespace(verify=lambda stored_hash, value: True),
    )
    monkeypatch.setattr(
        mfa_recovery_service,
        "log_action",
        lambda **kwargs: (_ for _ in ()).throw(SQLAlchemyError("audit failed")),
    )
    monkeypatch.setattr(
        mfa_recovery_service.email_service,
        "send_mfa_recovery_email",
        lambda email: notifications.append(email) or True,
    )

    ok, message = mfa_recovery_service.recover_authenticator(
        user.user_id,
        "ABCD-EFGH-JKLM-NPQR",
    )

    assert not ok
    assert message == "Não foi possível recuperar o acesso ao autenticador."
    assert session.rolled_back
    assert not session.committed
    assert notifications == []


def test_invalid_recovery_code_does_not_change_user(monkeypatch):
    user = make_user()
    session = FakeSession(results=[user])
    notifications = []
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )

    def reject(stored_hash, value):
        raise VerifyMismatchError()

    monkeypatch.setattr(
        mfa_recovery_service,
        "ph",
        SimpleNamespace(verify=reject),
    )
    monkeypatch.setattr(
        mfa_recovery_service.email_service,
        "send_mfa_recovery_email",
        lambda email: notifications.append(email) or True,
    )

    ok, message = mfa_recovery_service.recover_authenticator(
        user.user_id,
        "ABCD-EFGH-JKLM-NPQR",
    )

    assert not ok
    assert message == mfa_recovery_service.INVALID_RECOVERY_CODE_MESSAGE
    assert user.totp_secret_encrypted == "totp-secret"
    assert user.mfa_enabled is True
    assert user.mfa_recovery_code_hash == "argon-hash"
    assert session.rolled_back
    assert not session.committed
    assert notifications == []


def test_consumed_recovery_code_cannot_be_reused(monkeypatch):
    user = make_user()
    user.mfa_recovery_code_hash = None
    user.totp_secret_encrypted = None
    user.mfa_enabled = False
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = mfa_recovery_service.recover_authenticator(
        user.user_id,
        "ABCD-EFGH-JKLM-NPQR",
    )

    assert not ok
    assert message == mfa_recovery_service.INVALID_RECOVERY_CODE_MESSAGE
    assert session.rolled_back
