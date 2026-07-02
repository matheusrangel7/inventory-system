from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from argon2.exceptions import VerifyMismatchError
from sqlalchemy.exc import SQLAlchemyError

from app.domain.enums import RegistrationStatus
from app.models.mfa_reconfiguration_request import MfaReconfigurationRequest
from app.security.totp_secrets import (
    ACTIVE_SECRET_PURPOSE,
    PENDING_SECRET_PURPOSE,
    TotpSecretError,
)
from app.services import mfa_reconfiguration_service


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
    def __init__(self, results=None, execute_error=None):
        self.results = iter(results or [])
        self.execute_error = execute_error
        self.statements = []
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        if self.execute_error:
            raise self.execute_error
        self.statements.append(statement)
        return FakeResult(next(self.results))

    def add(self, value):
        self.added.append(value)

    def flush(self):
        for value in self.added:
            if getattr(value, "reconfiguration_id", None) is None:
                value.reconfiguration_id = 11

    def delete(self, value):
        self.deleted.append(value)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_user(**overrides):
    values = {
        "user_id": 7,
        "email": "user@example.com",
        "password_hash": "password-hash",
        "is_active": True,
        "registration_status": RegistrationStatus.COMPLETED,
        "totp_secret_encrypted": "active-envelope",
        "mfa_enabled": True,
        "mfa_recovery_code_hash": "old-recovery-hash",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_pending(**overrides):
    now = datetime.now(timezone.utc)
    values = {
        "reconfiguration_id": 11,
        "user_id": 7,
        "pending_totp_secret_encrypted": "pending-envelope",
        "created_at": now,
        "expires_at": now + timedelta(minutes=5),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def install_totp(monkeypatch, current_valid=True, pending_valid=True):
    def totp(secret):
        return SimpleNamespace(
            verify=lambda code, valid_window: pending_valid,
            provisioning_uri=lambda name, issuer_name: (
                f"otpauth://totp/{issuer_name}:{name}?secret={secret}"
            ),
        )

    monkeypatch.setattr(mfa_reconfiguration_service.pyotp, "TOTP", totp)
    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_service,
        "verify_user_totp",
        lambda user, code: current_valid,
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "encrypt_totp_secret",
        lambda secret, user_id, purpose: (
            "active-envelope-new"
            if purpose == ACTIVE_SECRET_PURPOSE
            else "pending-envelope-new"
        ),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "decrypt_totp_secret",
        lambda envelope, user_id, purpose: "pending-secret",
    )


def test_start_creates_pending_secret_without_changing_current_mfa(monkeypatch):
    user = make_user()
    session = FakeSession(results=[user, None])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "ph",
        SimpleNamespace(verify=lambda stored, supplied: True),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.pyotp,
        "random_base32",
        lambda: "pending-secret",
    )
    install_totp(monkeypatch)

    ok, message, setup = mfa_reconfiguration_service.start_reconfiguration(
        user.user_id,
        "Password1",
        "123456",
    )

    assert ok
    assert message == "Identidade confirmada."
    assert setup.reconfiguration_id == 11
    assert "pending-secret" in setup.otp_uri
    assert user.totp_secret_encrypted == "active-envelope"
    assert user.mfa_enabled is True
    assert len(session.added) == 1
    assert isinstance(session.added[0], MfaReconfigurationRequest)
    assert session.added[0].pending_totp_secret_encrypted == "pending-envelope-new"
    assert "pending-secret" not in session.added[0].pending_totp_secret_encrypted
    assert session.committed
    assert all(statement._for_update_arg is not None for statement in session.statements)


def test_start_replaces_existing_pending_setup(monkeypatch):
    user = make_user()
    pending = make_pending(pending_totp_secret_encrypted="old-pending-envelope")
    session = FakeSession(results=[user, pending])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "ph",
        SimpleNamespace(verify=lambda stored, supplied: True),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.pyotp,
        "random_base32",
        lambda: "new-pending-secret",
    )
    install_totp(monkeypatch)

    ok, _, setup = mfa_reconfiguration_service.start_reconfiguration(
        user.user_id,
        "Password1",
        "123456",
    )

    assert ok
    assert setup.reconfiguration_id == pending.reconfiguration_id
    assert pending.pending_totp_secret_encrypted == "pending-envelope-new"
    assert session.added == []
    assert user.totp_secret_encrypted == "active-envelope"


def test_invalid_current_factor_rolls_back_without_pending_state(monkeypatch):
    user = make_user()
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )

    def reject_password(stored, supplied):
        raise VerifyMismatchError()

    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "ph",
        SimpleNamespace(verify=reject_password),
    )
    install_totp(monkeypatch, current_valid=True)

    ok, message, setup = mfa_reconfiguration_service.start_reconfiguration(
        user.user_id,
        "wrong",
        "123456",
    )

    assert not ok
    assert message == mfa_reconfiguration_service.INVALID_CONFIRMATION_MESSAGE
    assert setup is None
    assert session.rolled_back
    assert session.added == []
    assert user.totp_secret_encrypted == "active-envelope"


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_active": False},
        {"registration_status": RegistrationStatus.PENDING},
        {"mfa_enabled": False},
        {"totp_secret_encrypted": None},
    ],
)
def test_start_rejects_account_without_active_completed_mfa(
    monkeypatch,
    overrides,
):
    user = make_user(**overrides)
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message, setup = mfa_reconfiguration_service.start_reconfiguration(
        user.user_id,
        "Password1",
        "123456",
    )

    assert not ok
    assert message == mfa_reconfiguration_service.INVALID_CONFIRMATION_MESSAGE
    assert setup is None
    assert session.rolled_back


def test_corrupted_current_totp_secret_encrypted_fails_with_generic_message(monkeypatch):
    user = make_user(totp_secret_encrypted="corrupted-secret")
    session = FakeSession(results=[user])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "ph",
        SimpleNamespace(verify=lambda stored, supplied: True),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_service,
        "verify_user_totp",
        lambda user, code: False,
    )

    ok, message, setup = mfa_reconfiguration_service.start_reconfiguration(
        user.user_id,
        "Password1",
        "123456",
    )

    assert not ok
    assert message == mfa_reconfiguration_service.INVALID_CONFIRMATION_MESSAGE
    assert setup is None
    assert session.rolled_back


def test_complete_rotates_mfa_recovery_code_and_sessions_atomically(monkeypatch):
    user = make_user()
    pending = make_pending()
    sessions = [
        SimpleNamespace(revoked=False, revoked_at=None),
        SimpleNamespace(revoked=False, revoked_at=None),
    ]
    session = FakeSession(results=[user, pending, sessions])
    audit_calls = []
    notifications = []
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    install_totp(monkeypatch)

    def apply_recovery_code(user_id):
        assert user_id == user.user_id
        user.mfa_recovery_code_hash = "new-recovery-hash"
        return "ABCD-EFGH-JKLM-NPQR"

    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_recovery_service,
        "apply_recovery_code",
        apply_recovery_code,
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.email_service,
        "send_mfa_reconfiguration_email",
        lambda email: notifications.append((session.committed, email)) or True,
    )

    ok, message, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            user.user_id,
            pending.reconfiguration_id,
            "654321",
            mfa_reconfiguration_service._fingerprint(user.password_hash),
            mfa_reconfiguration_service._fingerprint(user.totp_secret_encrypted),
        )
    )

    assert ok
    assert message == "Autenticador reconfigurado com sucesso."
    assert recovery_code == "ABCD-EFGH-JKLM-NPQR"
    assert not step_valid
    assert user.totp_secret_encrypted == "active-envelope-new"
    assert user.totp_secret_encrypted != pending.pending_totp_secret_encrypted
    assert user.mfa_recovery_code_hash == "new-recovery-hash"
    assert all(item.revoked and item.revoked_at for item in sessions)
    assert session.deleted == [pending]
    assert session.committed
    assert notifications == [(True, user.email)]
    assert audit_calls[0]["new_value"] == {
        "mfa_enabled": True,
        "mfa_reconfigured": True,
        "recovery_code_rotated": True,
        "sessions_revoked": True,
    }
    assert "pending-secret" not in str(audit_calls)
    assert "ABCD-EFGH-JKLM-NPQR" not in str(audit_calls)


def test_reconfiguration_email_failure_does_not_rollback_completion(monkeypatch):
    user = make_user()
    pending = make_pending()
    sessions = [SimpleNamespace(revoked=False, revoked_at=None)]
    session = FakeSession(results=[user, pending, sessions])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    install_totp(monkeypatch)
    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_recovery_service,
        "apply_recovery_code",
        lambda user_id: "ABCD-EFGH-JKLM-NPQR",
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "log_action",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.email_service,
        "send_mfa_reconfiguration_email",
        lambda email: False,
    )

    ok, _, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            user.user_id,
            pending.reconfiguration_id,
            "654321",
            mfa_reconfiguration_service._fingerprint(user.password_hash),
            mfa_reconfiguration_service._fingerprint(user.totp_secret_encrypted),
        )
    )

    assert ok
    assert recovery_code == "ABCD-EFGH-JKLM-NPQR"
    assert not step_valid
    assert session.committed
    assert not session.rolled_back
    assert session.deleted == [pending]
    assert user.totp_secret_encrypted == "active-envelope-new"


def test_invalid_new_totp_preserves_old_authenticator_and_recovery_code(
    monkeypatch,
):
    user = make_user()
    pending = make_pending()
    session = FakeSession(results=[user, pending])
    notifications = []
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    install_totp(monkeypatch, pending_valid=False)
    monkeypatch.setattr(
        mfa_reconfiguration_service.email_service,
        "send_mfa_reconfiguration_email",
        lambda email: notifications.append(email) or True,
    )

    ok, message, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            user.user_id,
            pending.reconfiguration_id,
            "000000",
            mfa_reconfiguration_service._fingerprint(user.password_hash),
            mfa_reconfiguration_service._fingerprint(user.totp_secret_encrypted),
        )
    )

    assert not ok
    assert message == mfa_reconfiguration_service.INVALID_NEW_CODE_MESSAGE
    assert recovery_code is None
    assert step_valid
    assert user.totp_secret_encrypted == "active-envelope"
    assert user.mfa_recovery_code_hash == "old-recovery-hash"
    assert session.rolled_back
    assert session.deleted == []
    assert notifications == []


def test_expired_or_changed_state_invalidates_confirmation(monkeypatch):
    for pending, password_fingerprint in (
        (
            make_pending(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)),
            mfa_reconfiguration_service._fingerprint("password-hash"),
        ),
        (
            make_pending(),
            mfa_reconfiguration_service._fingerprint("previous-password-hash"),
        ),
    ):
        user = make_user()
        session = FakeSession(results=[user, pending])
        monkeypatch.setattr(
            mfa_reconfiguration_service,
            "db",
            SimpleNamespace(session=session),
        )

        ok, message, _, step_valid = (
            mfa_reconfiguration_service.complete_reconfiguration(
                user.user_id,
                pending.reconfiguration_id,
                "654321",
                password_fingerprint,
                mfa_reconfiguration_service._fingerprint(user.totp_secret_encrypted),
            )
        )

        assert not ok
        assert message == mfa_reconfiguration_service.INVALID_STEP_MESSAGE
        assert not step_valid
        assert user.totp_secret_encrypted == "active-envelope"
        assert session.rolled_back


def test_transaction_failure_rolls_back_completion(monkeypatch):
    user = make_user()
    pending = make_pending()
    sessions = [SimpleNamespace(revoked=False, revoked_at=None)]
    session = FakeSession(results=[user, pending, sessions])
    notifications = []
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.session_service,
        "db",
        SimpleNamespace(session=session),
    )
    install_totp(monkeypatch)
    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_recovery_service,
        "apply_recovery_code",
        lambda user_id: "ABCD-EFGH-JKLM-NPQR",
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "log_action",
        lambda **kwargs: (_ for _ in ()).throw(SQLAlchemyError("audit failed")),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.email_service,
        "send_mfa_reconfiguration_email",
        lambda email: notifications.append(email) or True,
    )

    ok, message, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            user.user_id,
            pending.reconfiguration_id,
            "654321",
            mfa_reconfiguration_service._fingerprint(user.password_hash),
            mfa_reconfiguration_service._fingerprint(user.totp_secret_encrypted),
        )
    )

    assert not ok
    assert message == "Não foi possível concluir a reconfiguração MFA."
    assert recovery_code is None
    assert step_valid
    assert session.rolled_back
    assert not session.committed
    assert notifications == []


def test_active_encryption_failure_preserves_existing_mfa_state(monkeypatch):
    user = make_user()
    pending = make_pending()
    session = FakeSession(results=[user, pending])
    recovery_calls = []
    audit_calls = []
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )
    install_totp(monkeypatch)
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "encrypt_totp_secret",
        lambda secret, user_id, purpose: (
            (_ for _ in ()).throw(TotpSecretError())
            if purpose == ACTIVE_SECRET_PURPOSE
            else "pending-envelope-new"
        ),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service.mfa_recovery_service,
        "apply_recovery_code",
        lambda user_id: recovery_calls.append(user_id),
    )
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )

    ok, message, recovery_code, step_valid = (
        mfa_reconfiguration_service.complete_reconfiguration(
            user.user_id,
            pending.reconfiguration_id,
            "654321",
            mfa_reconfiguration_service._fingerprint(user.password_hash),
            mfa_reconfiguration_service._fingerprint(
                user.totp_secret_encrypted
            ),
        )
    )

    assert not ok
    assert message == "Não foi possível concluir a reconfiguração MFA."
    assert recovery_code is None
    assert step_valid
    assert user.totp_secret_encrypted == "active-envelope"
    assert user.mfa_recovery_code_hash == "old-recovery-hash"
    assert recovery_calls == []
    assert audit_calls == []
    assert session.deleted == []
    assert session.rolled_back
    assert not session.committed


def test_cancel_deletes_pending_setup_without_touching_active_mfa(monkeypatch):
    user = make_user()
    pending = make_pending()
    session = FakeSession(results=[user, pending])
    monkeypatch.setattr(
        mfa_reconfiguration_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message = mfa_reconfiguration_service.cancel_reconfiguration(
        user.user_id
    )

    assert ok
    assert message == "Reconfiguração MFA cancelada."
    assert session.deleted == [pending]
    assert session.committed
    assert user.totp_secret_encrypted == "active-envelope"
    assert user.mfa_recovery_code_hash == "old-recovery-hash"
