from types import SimpleNamespace

from sqlalchemy.exc import SQLAlchemyError

from app.services import admin_transfer_service, mfa_enrollment_service


class FakeSession:
    def __init__(self, rollback_effect=None, commit_effect=None):
        self.commits = 0
        self.rollbacks = 0
        self.rollback_effect = rollback_effect
        self.commit_effect = commit_effect

    def commit(self):
        if self.commit_effect:
            self.commit_effect()
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1
        if self.rollback_effect:
            self.rollback_effect()


def test_confirm_enrollment_commits_regular_mfa_setup(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (True, "MFA ativado com sucesso."),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: False,
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert ok
    assert message == "MFA ativado com sucesso."
    assert session.commits == 1
    assert session.rollbacks == 0


def test_confirm_enrollment_commits_transfer_before_notifications(monkeypatch):
    events = []
    session = FakeSession()
    completion = admin_transfer_service.AdminTransferCompletion(
        old_admin_id=1,
        old_admin_email="old.admin@ubi.pt",
        new_admin_id=2,
        new_admin_email="new.admin@ubi.pt",
    )
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (True, "MFA ativado com sucesso."),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: True,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "apply_pending_after_mfa",
        lambda user_id: completion,
    )

    def commit():
        events.append("commit")
        session.commits += 1

    session.commit = commit
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "notify_admin_transfer_completion",
        lambda result: events.append(("notify", result)),
    )

    ok, _ = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert ok
    assert events == ["commit", ("notify", completion)]
    assert session.rollbacks == 0


def test_confirm_enrollment_rolls_back_mfa_when_transfer_cannot_complete(
    monkeypatch,
):
    user = SimpleNamespace(mfa_enabled=False)
    session = FakeSession(
        rollback_effect=lambda: setattr(user, "mfa_enabled", False),
    )
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )

    def apply_mfa(user_id, code):
        user.mfa_enabled = True
        return True, "MFA ativado com sucesso."

    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        apply_mfa,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: True,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "apply_pending_after_mfa",
        lambda user_id: None,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "notify_admin_transfer_completion",
        lambda completion: (_ for _ in ()).throw(
            AssertionError("notifications must not run after rollback")
        ),
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert not ok
    assert message == mfa_enrollment_service.TRANSFER_COMPLETION_ERROR
    assert user.mfa_enabled is False
    assert session.commits == 0
    assert session.rollbacks == 1


def test_confirm_enrollment_rolls_back_invalid_mfa_attempt(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (False, "Código inválido."),
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "invalid")

    assert not ok
    assert message == "Código inválido."
    assert session.commits == 0
    assert session.rollbacks == 1


def test_confirm_enrollment_rolls_back_database_error(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (True, "MFA ativado com sucesso."),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: True,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "apply_pending_after_mfa",
        lambda user_id: (_ for _ in ()).throw(
            SQLAlchemyError("database failure")
        ),
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert not ok
    assert message == mfa_enrollment_service.TRANSFER_COMPLETION_ERROR
    assert session.commits == 0
    assert session.rollbacks == 1


def test_confirm_enrollment_reports_regular_mfa_commit_failure(monkeypatch):
    def fail_commit():
        raise SQLAlchemyError("commit failure")

    session = FakeSession(commit_effect=fail_commit)
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (True, "MFA ativado com sucesso."),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: False,
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert not ok
    assert message == mfa_enrollment_service.MFA_CONFIRMATION_ERROR
    assert session.commits == 0
    assert session.rollbacks == 1


def test_confirm_enrollment_succeeds_when_post_commit_effects_fail(monkeypatch):
    session = FakeSession()
    completion = admin_transfer_service.AdminTransferCompletion(
        old_admin_id=1,
        old_admin_email="old.admin@ubi.pt",
        new_admin_id=2,
        new_admin_email="new.admin@ubi.pt",
    )
    monkeypatch.setattr(
        mfa_enrollment_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.mfa_service,
        "apply_mfa_setup_confirmation",
        lambda user_id, code: (True, "MFA ativado com sucesso."),
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: True,
    )
    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "apply_pending_after_mfa",
        lambda user_id: completion,
    )
    def fail_notifications(result):
        raise RuntimeError("notification failure")

    monkeypatch.setattr(
        mfa_enrollment_service.admin_transfer_service,
        "notify_admin_transfer_completion",
        fail_notifications,
    )

    ok, message = mfa_enrollment_service.confirm_enrollment(2, "123456")

    assert ok
    assert message == "MFA ativado com sucesso."
    assert session.commits == 1
    assert session.rollbacks == 0
