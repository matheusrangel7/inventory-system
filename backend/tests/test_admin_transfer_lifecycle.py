from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.enums import AdminTransferStatus, RegistrationStatus, UserRole
from app.services import admin_transfer_service


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def first(self):
        return self.value


class FakeSession:
    def __init__(self, results, *, users=None):
        self.results = iter(results)
        self.users = users or {}
        self.statements = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        self.statements.append(statement)
        return FakeResult(next(self.results))

    def get(self, model, key):
        return self.users.get(key)

    def delete(self, value):
        raise AssertionError("pending transfers must not be physically deleted")

    def flush(self):
        return None

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_transfer():
    return SimpleNamespace(
        transfer_id=10,
        initiated_by=1,
        target_user_id=2,
        status=AdminTransferStatus.PENDING,
        resolved_at=None,
    )


def make_current_admin(**overrides):
    values = {
        "user_id": 1,
        "email": "old.admin@ubi.pt",
        "password_hash": "password-hash",
        "totp_secret_encrypted": "totp-secret",
        "mfa_enabled": True,
        "is_active": True,
        "role": UserRole.ADMINISTRATOR,
        "registration_status": RegistrationStatus.COMPLETED,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_transfer_confirmation_verifies_password_totp_and_locks_admin(monkeypatch):
    current = make_current_admin()
    session = FakeSession([current])
    password_checks = []
    totp_checks = []

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "ph",
        SimpleNamespace(
            verify=lambda stored_hash, password: (
                password_checks.append((stored_hash, password)) or True
            )
        ),
    )
    monkeypatch.setattr(
        admin_transfer_service.mfa_service,
        "verify_user_totp",
        lambda user, code: (
            totp_checks.append((user.totp_secret_encrypted, code)) or True
        ),
    )

    ok, message, user = admin_transfer_service._confirm_transfer_credentials(
        current.user_id,
        "valid-password",
        "123456",
    )

    assert ok
    assert message == "Credenciais confirmadas."
    assert user is current
    assert password_checks == [("password-hash", "valid-password")]
    assert totp_checks == [("totp-secret", "123456")]
    assert session.statements[0]._for_update_arg is not None
    assert not session.rolled_back


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_active": False},
        {"registration_status": RegistrationStatus.PENDING},
        {"role": UserRole.MANAGER},
        {"mfa_enabled": False},
        {"totp_secret_encrypted": None},
    ],
)
def test_transfer_confirmation_rejects_invalid_admin_state(monkeypatch, overrides):
    session = FakeSession([make_current_admin(**overrides)])
    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))

    ok, message, user = admin_transfer_service._confirm_transfer_credentials(
        1,
        "valid-password",
        "123456",
    )

    assert not ok
    assert message == admin_transfer_service.INVALID_CONFIRMATION_MESSAGE
    assert user is None
    assert session.rolled_back


@pytest.mark.parametrize(
    ("password_valid", "totp_valid"),
    [(False, True), (True, False), (False, False)],
)
def test_transfer_confirmation_uses_generic_error_for_invalid_factor(
    monkeypatch,
    password_valid,
    totp_valid,
):
    session = FakeSession([make_current_admin()])
    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "ph",
        SimpleNamespace(verify=lambda stored_hash, password: password_valid),
    )
    monkeypatch.setattr(
        admin_transfer_service.mfa_service,
        "verify_user_totp",
        lambda user, code: totp_valid,
    )

    ok, message, user = admin_transfer_service._confirm_transfer_credentials(
        1,
        "submitted-password",
        "123456",
    )

    assert not ok
    assert message == admin_transfer_service.INVALID_CONFIRMATION_MESSAGE
    assert user is None
    assert session.rolled_back


@pytest.mark.parametrize("mode", ["existing", "new"])
def test_invalid_confirmation_stops_both_transfer_flows(monkeypatch, mode):
    session = FakeSession([None])
    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "_confirm_transfer_credentials",
        lambda *args: (
            False,
            admin_transfer_service.INVALID_CONFIRMATION_MESSAGE,
            None,
        ),
    )
    monkeypatch.setattr(
        admin_transfer_service.user_service,
        "create_pending_gestor",
        lambda *args, **kwargs: pytest.fail("user must not be created"),
    )

    if mode == "existing":
        result = admin_transfer_service.transfer_to_existing_admin(
            current_admin_id=1,
            target_user_id=2,
            password="invalid-password",
            totp_code="123456",
        )
        assert result == (
            False,
            admin_transfer_service.INVALID_CONFIRMATION_MESSAGE,
        )
    else:
        result = admin_transfer_service.start_transfer_to_new_admin(
            current_admin_id=1,
            email="new.admin@ubi.pt",
            password="invalid-password",
            totp_code="123456",
        )
        assert result == (
            False,
            admin_transfer_service.INVALID_CONFIRMATION_MESSAGE,
            None,
        )


def test_cancel_pending_transfer_marks_transfer_cancelled(monkeypatch):
    transfer = make_transfer()
    target = SimpleNamespace(is_active=True)
    session = FakeSession([transfer], users={2: target})

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "clear_registration_token",
        lambda user: None,
    )
    monkeypatch.setattr(admin_transfer_service, "log_action", lambda **kwargs: None)

    ok, _ = admin_transfer_service.cancel_pending_transfer(current_admin_id=1)

    assert ok
    assert transfer.status == AdminTransferStatus.CANCELLED
    assert transfer.resolved_at is not None
    assert target.is_active is False
    assert session.committed


def test_expire_pending_transfer_marks_transfer_expired(monkeypatch):
    transfer = make_transfer()
    target = SimpleNamespace(
        registration_status=RegistrationStatus.PENDING,
        is_active=True,
    )
    session = FakeSession([transfer], users={2: target})

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "clear_registration_token",
        lambda user: None,
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "is_registration_token_expired",
        lambda user: True,
    )
    monkeypatch.setattr(admin_transfer_service, "log_action", lambda **kwargs: None)

    assert admin_transfer_service.expire_pending_for_target(target_user_id=2)
    assert transfer.status == AdminTransferStatus.EXPIRED
    assert transfer.resolved_at is not None
    assert target.is_active is False
    assert session.committed


def test_complete_pending_transfer_marks_transfer_completed(monkeypatch):
    transfer = make_transfer()
    old_admin = SimpleNamespace(
        user_id=1,
        email="old.admin@ubi.pt",
        is_active=True,
        role=UserRole.ADMINISTRATOR,
    )
    new_admin = SimpleNamespace(
        user_id=2,
        email="new.admin@ubi.pt",
        is_active=True,
        role=UserRole.MANAGER,
        registration_status=RegistrationStatus.COMPLETED,
        mfa_enabled=True,
    )
    session = FakeSession([transfer, old_admin, new_admin])

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "_remove_locations_from_user",
        lambda *args: None,
    )
    monkeypatch.setattr(admin_transfer_service, "log_action", lambda **kwargs: None)
    completion = admin_transfer_service.apply_pending_after_mfa(target_user_id=2)

    assert completion == admin_transfer_service.AdminTransferCompletion(
        old_admin_id=1,
        old_admin_email="old.admin@ubi.pt",
        new_admin_id=2,
        new_admin_email="new.admin@ubi.pt",
    )
    assert transfer.status == AdminTransferStatus.COMPLETED
    assert transfer.resolved_at is not None
    assert old_admin.role == UserRole.MANAGER
    assert new_admin.role == UserRole.ADMINISTRATOR
    assert not session.committed


def test_existing_admin_transfer_notifies_only_after_commit(monkeypatch):
    events = []
    audit_calls = []
    current = SimpleNamespace(
        user_id=1,
        email="old.admin@ubi.pt",
        is_active=True,
        role=UserRole.ADMINISTRATOR,
    )
    target = SimpleNamespace(
        user_id=2,
        email="new.admin@ubi.pt",
        is_active=True,
        role=UserRole.MANAGER,
        registration_status=RegistrationStatus.COMPLETED,
        mfa_enabled=True,
    )
    session = FakeSession([None, target])
    session.commit = lambda: events.append("commit")

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "_confirm_transfer_credentials",
        lambda *args: (True, "Credenciais confirmadas.", current),
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "_remove_locations_from_user",
        lambda *args: None,
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "log_action",
        lambda *args, **kwargs: audit_calls.append((args, kwargs)),
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "notify_admin_transfer_completion",
        lambda completion: events.append(("notify", completion)),
    )

    ok, message = admin_transfer_service.transfer_to_existing_admin(
        current_admin_id=current.user_id,
        target_user_id=target.user_id,
        password="valid-password",
        totp_code="123456",
    )

    assert ok
    assert message == "Administração transferida com sucesso."
    assert current.role == UserRole.MANAGER
    assert target.role == UserRole.ADMINISTRATOR
    assert events == [
        "commit",
        (
            "notify",
            admin_transfer_service.AdminTransferCompletion(
                old_admin_id=current.user_id,
                old_admin_email=current.email,
                new_admin_id=target.user_id,
                new_admin_email=target.email,
            ),
        ),
    ]
    assert "valid-password" not in str(audit_calls)
    assert "123456" not in str(audit_calls)


def test_notify_admin_transfer_completion_runs_after_commit_actions(monkeypatch):
    events = []
    completion = admin_transfer_service.AdminTransferCompletion(
        old_admin_id=1,
        old_admin_email="old.admin@ubi.pt",
        new_admin_id=2,
        new_admin_email="new.admin@ubi.pt",
    )
    monkeypatch.setattr(
        admin_transfer_service.session_service,
        "revoke_all_sessions",
        lambda user_id: events.append(("revoke", user_id)),
    )
    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_transfer_email",
        lambda email: events.append(("promoted_email", email)) or True,
    )
    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_demoted_email",
        lambda email: events.append(("demoted_email", email)) or True,
    )

    admin_transfer_service.notify_admin_transfer_completion(completion)

    assert events == [
        ("revoke", 1),
        ("revoke", 2),
        ("promoted_email", "new.admin@ubi.pt"),
        ("demoted_email", "old.admin@ubi.pt"),
    ]


def test_notify_admin_transfer_completion_isolates_failures(monkeypatch):
    events = []
    session = SimpleNamespace(
        rollback=lambda: events.append(("rollback", None)),
    )
    completion = admin_transfer_service.AdminTransferCompletion(
        old_admin_id=1,
        old_admin_email="old.admin@ubi.pt",
        new_admin_id=2,
        new_admin_email="new.admin@ubi.pt",
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "db",
        SimpleNamespace(session=session),
    )

    def revoke_sessions(user_id):
        events.append(("revoke", user_id))
        if user_id == completion.old_admin_id:
            raise RuntimeError("session failure")

    monkeypatch.setattr(
        admin_transfer_service.session_service,
        "revoke_all_sessions",
        revoke_sessions,
    )

    def fail_admin_transfer_email(email):
        raise RuntimeError("email failure")

    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_transfer_email",
        fail_admin_transfer_email,
    )
    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_demoted_email",
        lambda email: events.append(("demoted_email", email)) or False,
    )

    admin_transfer_service.notify_admin_transfer_completion(completion)

    assert events == [
        ("revoke", 1),
        ("rollback", None),
        ("revoke", 2),
        ("demoted_email", "old.admin@ubi.pt"),
    ]


def test_reading_expired_transfer_does_not_mutate_state(monkeypatch):
    transfer = make_transfer()
    transfer.created_at = None
    target = SimpleNamespace(
        user_id=2,
        email="pending.admin@ubi.pt",
        registration_status=RegistrationStatus.PENDING,
        registration_token_expires_at=None,
    )
    session = FakeSession([transfer], users={2: target})

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "is_registration_token_expired",
        lambda user: True,
    )

    assert admin_transfer_service.get_pending_transfer() is None
    assert transfer.status == AdminTransferStatus.PENDING
    assert not session.committed


def test_service_contains_no_physical_delete():
    source = Path(admin_transfer_service.__file__).read_text()
    assert "session.delete(" not in source
