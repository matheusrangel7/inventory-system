from pathlib import Path
from types import SimpleNamespace

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
        status=admin_transfer_service.PENDING_TRANSFER_STATUS,
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
    assert transfer.status == admin_transfer_service.CANCELLED_TRANSFER_STATUS
    assert transfer.resolved_at is not None
    assert target.is_active is False
    assert session.committed


def test_expire_pending_transfer_marks_transfer_expired(monkeypatch):
    transfer = make_transfer()
    target = SimpleNamespace(registration_status="Pendente", is_active=True)
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
    assert transfer.status == admin_transfer_service.EXPIRED_TRANSFER_STATUS
    assert transfer.resolved_at is not None
    assert target.is_active is False
    assert session.committed


def test_complete_pending_transfer_marks_transfer_completed(monkeypatch):
    transfer = make_transfer()
    old_admin = SimpleNamespace(
        user_id=1,
        email="old.admin@ubi.pt",
        is_active=True,
        role="Administrador",
    )
    new_admin = SimpleNamespace(
        user_id=2,
        email="new.admin@ubi.pt",
        is_active=True,
        role="Gestor",
        registration_status="Concluído",
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
    monkeypatch.setattr(
        admin_transfer_service.session_service,
        "revoke_all_sessions",
        lambda user_id: None,
    )
    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_transfer_email",
        lambda email: True,
    )
    monkeypatch.setattr(
        admin_transfer_service.email_service,
        "send_admin_demoted_email",
        lambda email: True,
    )

    assert admin_transfer_service.complete_pending_after_mfa(target_user_id=2)
    assert transfer.status == admin_transfer_service.COMPLETED_TRANSFER_STATUS
    assert transfer.resolved_at is not None
    assert old_admin.role == "Gestor"
    assert new_admin.role == "Administrador"
    assert session.committed


def test_reading_expired_transfer_does_not_mutate_state(monkeypatch):
    transfer = make_transfer()
    transfer.created_at = None
    target = SimpleNamespace(
        user_id=2,
        email="pending.admin@ubi.pt",
        registration_status="Pendente",
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
    assert transfer.status == admin_transfer_service.PENDING_TRANSFER_STATUS
    assert not session.committed


def test_service_contains_no_physical_delete():
    source = Path(admin_transfer_service.__file__).read_text()
    assert "session.delete(" not in source
