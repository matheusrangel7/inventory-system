from types import SimpleNamespace

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.domain.enums import RegistrationStatus, UserRole
from app.services import admin_account_recovery_service


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(
        self,
        results=None,
        *,
        commit_error=None,
        execute_error=None,
        events=None,
    ):
        self.results = iter(results or [])
        self.commit_error = commit_error
        self.execute_error = execute_error
        self.events = events if events is not None else []
        self.statements = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        if self.execute_error:
            raise self.execute_error
        self.statements.append(statement)
        return FakeResult(next(self.results))

    def delete(self, value):
        self.deleted.append(value)

    def commit(self):
        self.events.append("commit")
        if self.commit_error:
            raise self.commit_error
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_admin():
    return SimpleNamespace(user_id=1, email="admin@ubi.pt")


def make_target(**overrides):
    values = {
        "user_id": 7,
        "email": "gestor@ubi.pt",
        "role": UserRole.MANAGER,
        "registration_status": RegistrationStatus.COMPLETED,
        "is_active": True,
        "mfa_enabled": True,
        "totp_secret_encrypted": "totp:v1:key:nonce:ciphertext",
        "mfa_recovery_code_hash": "argon-hash",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def install_confirmation(monkeypatch, *, valid=True):
    administrator = make_admin()
    monkeypatch.setattr(
        admin_account_recovery_service.admin_confirmation_service,
        "confirm_administrator",
        lambda *args: (
            (True, "Credenciais confirmadas.", administrator)
            if valid
            else (
                False,
                admin_account_recovery_service.admin_confirmation_service.INVALID_CONFIRMATION_MESSAGE,
                None,
            )
        ),
    )
    return administrator


def install_common_spies(monkeypatch):
    audit_calls = []
    revoked_users = []
    monkeypatch.setattr(
        admin_account_recovery_service,
        "log_action",
        lambda **kwargs: audit_calls.append(kwargs),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.session_service,
        "apply_revoke_all_sessions",
        lambda user_id: revoked_users.append(user_id),
    )
    return audit_calls, revoked_users


def test_invalid_confirmation_is_generic_and_stops_before_target_lock(monkeypatch):
    session = FakeSession()
    install_confirmation(monkeypatch, valid=False)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message, user, status = admin_account_recovery_service.reset_mfa(
        1,
        7,
        "wrong-password",
        "123456",
    )

    assert not ok
    assert message == "Credenciais de confirmação inválidas."
    assert user is None
    assert status == 400
    assert session.statements == []


def test_target_lock_database_failure_rolls_back_with_controlled_error(
    monkeypatch,
):
    session = FakeSession(execute_error=SQLAlchemyError("select failed"))
    install_confirmation(monkeypatch)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message, user, status = (
        admin_account_recovery_service.request_password_reset(
            1,
            7,
            "Password1",
            "123456",
        )
    )

    assert not ok
    assert message == "Não foi possível processar a recuperação de acesso."
    assert user is None
    assert status == 500
    assert session.rolled_back


@pytest.mark.parametrize(
    "target",
    [
        None,
        make_target(user_id=1),
        make_target(is_active=False),
        make_target(role=UserRole.ADMINISTRATOR),
        make_target(registration_status=RegistrationStatus.PENDING),
    ],
)
def test_invalid_target_rolls_back(monkeypatch, target):
    session = FakeSession([target])
    install_confirmation(monkeypatch)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )

    ok, message, user, status = (
        admin_account_recovery_service.request_password_reset(
            1,
            7,
            "Password1",
            "123456",
        )
    )

    assert not ok
    assert message == admin_account_recovery_service.INVALID_TARGET_MESSAGE
    assert user is None
    assert status == 400
    assert session.rolled_back
    assert session.statements[0]._for_update_arg is not None


def test_email_change_is_atomic_and_notifies_both_addresses_after_commit(
    monkeypatch,
):
    target = make_target()
    reset_token = SimpleNamespace()
    events = []
    session = FakeSession([target, None, reset_token], events=events)
    install_confirmation(monkeypatch)
    audit_calls, revoked_users = install_common_spies(monkeypatch)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_recovery_email_changed_old_address",
        lambda old, new: events.append(("old-email", old, new)) or True,
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_recovery_email_changed_new_address",
        lambda new, old: events.append(("new-email", new, old)) or True,
    )

    ok, message, user, status = admin_account_recovery_service.change_email(
        1,
        target.user_id,
        "NOVO.GESTOR@UBI.PT",
        "Password1",
        "123456",
    )

    assert ok
    assert message == "Email alterado com sucesso."
    assert status == 200
    assert user is target
    assert target.email == "novo.gestor@ubi.pt"
    assert session.deleted == [reset_token]
    assert revoked_users == [target.user_id]
    assert events[0] == "commit"
    assert events[1:] == [
        ("old-email", "gestor@ubi.pt", "novo.gestor@ubi.pt"),
        ("new-email", "novo.gestor@ubi.pt", "gestor@ubi.pt"),
    ]
    assert all(statement._for_update_arg is not None for statement in session.statements)
    assert audit_calls[0]["user_id"] == 1
    assert audit_calls[0]["old_value"] == {"email": "gestor@ubi.pt"}
    assert "Password1" not in repr(audit_calls)
    assert "123456" not in repr(audit_calls)


def test_email_change_notification_failure_does_not_rollback(monkeypatch):
    target = make_target()
    session = FakeSession([target, None, None])
    install_confirmation(monkeypatch)
    install_common_spies(monkeypatch)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_recovery_email_changed_old_address",
        lambda *args: False,
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_recovery_email_changed_new_address",
        lambda *args: True,
    )

    ok, message, _, _ = admin_account_recovery_service.change_email(
        1,
        target.user_id,
        "novo@ubi.pt",
        "Password1",
        "123456",
    )

    assert ok
    assert "Não foi possível enviar" in message
    assert session.committed
    assert not session.rolled_back


def test_password_recovery_replaces_token_without_revoking_sessions(monkeypatch):
    target = make_target()
    session = FakeSession([target])
    events = []
    install_confirmation(monkeypatch)
    audit_calls, revoked_users = install_common_spies(monkeypatch)
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.password_reset_service,
        "issue_password_reset_token",
        lambda user: "raw-one-time-token",
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_password_reset_email",
        lambda email, token: events.append(
            ("email", session.committed, email, token)
        )
        or True,
    )

    ok, message, _, _ = (
        admin_account_recovery_service.request_password_reset(
            1,
            target.user_id,
            "Password1",
            "123456",
        )
    )

    assert ok
    assert message == "Link de redefinição de password emitido com sucesso."
    assert session.committed
    assert revoked_users == []
    assert events == [
        ("email", True, target.email, "raw-one-time-token"),
    ]
    assert audit_calls[0]["user_id"] == 1
    assert "raw-one-time-token" not in repr(audit_calls)


def test_mfa_reset_clears_all_related_state_and_revokes_sessions(monkeypatch):
    target = make_target()
    pending = SimpleNamespace(user_id=target.user_id)
    session = FakeSession([target, pending])
    install_confirmation(monkeypatch)
    audit_calls, revoked_users = install_common_spies(monkeypatch)
    notified = []
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_administrative_mfa_reset_email",
        lambda email: notified.append((session.committed, email)) or True,
    )

    ok, message, _, _ = admin_account_recovery_service.reset_mfa(
        1,
        target.user_id,
        "Password1",
        "123456",
    )

    assert ok
    assert message == "MFA redefinido com sucesso."
    assert target.totp_secret_encrypted is None
    assert target.mfa_enabled is False
    assert target.mfa_recovery_code_hash is None
    assert session.deleted == [pending]
    assert revoked_users == [target.user_id]
    assert session.committed
    assert notified == [(True, target.email)]
    assert audit_calls[0]["user_id"] == 1
    assert "totp:v1" not in repr(audit_calls)
    assert "argon-hash" not in repr(audit_calls)


def test_transaction_failure_rolls_back_without_notification(monkeypatch):
    target = make_target()
    session = FakeSession(
        [target, None],
        commit_error=SQLAlchemyError("commit failed"),
    )
    install_confirmation(monkeypatch)
    install_common_spies(monkeypatch)
    notified = []
    monkeypatch.setattr(
        admin_account_recovery_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        admin_account_recovery_service.password_reset_service,
        "issue_password_reset_token",
        lambda user: "raw-token",
    )
    monkeypatch.setattr(
        admin_account_recovery_service.email_service,
        "send_password_reset_email",
        lambda *args: notified.append(args),
    )

    ok, _, user, status = (
        admin_account_recovery_service.request_password_reset(
            1,
            target.user_id,
            "Password1",
            "123456",
        )
    )

    assert not ok
    assert user is None
    assert status == 500
    assert session.rolled_back
    assert notified == []
