from pathlib import Path
from types import SimpleNamespace

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
        self.committed = False

    def execute(self, statement):
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
        return None


def make_transfer():
    return SimpleNamespace(
        transfer_id=10,
        initiated_by=1,
        target_user_id=2,
        status=AdminTransferStatus.PENDING,
        resolved_at=None,
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
    session = FakeSession([None, current, target])
    session.commit = lambda: events.append("commit")

    monkeypatch.setattr(admin_transfer_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        admin_transfer_service,
        "_verify_transfer_password",
        lambda *args: (True, "Senha válida."),
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "_remove_locations_from_user",
        lambda *args: None,
    )
    monkeypatch.setattr(
        admin_transfer_service,
        "log_action",
        lambda *args, **kwargs: None,
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
