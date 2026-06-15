from types import SimpleNamespace

import pytest
from flask import Flask

from app.domain.enums import RegistrationStatus, UserRole
from app.routes import users
from app.services import user_service


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, results):
        self.results = iter(results)
        self.added = None
        self.committed = False

    def execute(self, statement):
        return FakeResult(next(self.results))

    def add(self, value):
        self.added = value

    def flush(self):
        if self.added is not None and self.added.user_id is None:
            self.added.user_id = 10

    def commit(self):
        self.committed = True


def make_user(
    *,
    is_active=False,
    role=UserRole.MANAGER,
    registration_status=RegistrationStatus.PENDING,
    mfa_enabled=False,
):
    return SimpleNamespace(
        user_id=10,
        is_active=is_active,
        role=role,
        registration_status=registration_status,
        mfa_enabled=mfa_enabled,
        password_hash="old-hash",
        totp_secret_encrypted="old-secret",
        mfa_recovery_code_hash="old-recovery-hash",
        email="gestor@ubi.pt",
        created_at=None,
    )


def test_pending_inactive_gestor_can_be_reactivated():
    user = make_user()

    assert user_service._can_reactivate_inactive_gestor(user, allow_completed=False)


def test_completed_inactive_gestor_requires_explicit_allow_completed():
    user = make_user(
        registration_status=RegistrationStatus.COMPLETED,
        mfa_enabled=True,
    )

    assert not user_service._can_reactivate_inactive_gestor(
        user, allow_completed=False
    )
    assert user_service._can_reactivate_inactive_gestor(user, allow_completed=True)


def test_active_user_with_same_email_is_not_reactivated():
    user = make_user(is_active=True)

    assert not user_service._can_reactivate_inactive_gestor(
        user, allow_completed=True
    )


def test_non_gestor_user_is_not_reactivated():
    user = make_user(role=UserRole.ADMINISTRATOR)

    assert not user_service._can_reactivate_inactive_gestor(
        user, allow_completed=True
    )


def test_completed_gestor_reset_clears_old_credentials(monkeypatch):
    user = make_user(
        registration_status=RegistrationStatus.COMPLETED,
        mfa_enabled=True,
    )

    class DummyPasswordHasher:
        @staticmethod
        def hash(value):
            assert value
            return "new-random-hash"

    monkeypatch.setattr(user_service, "ph", DummyPasswordHasher())

    user_service._reset_completed_gestor_for_invite(user)

    assert user.password_hash == "new-random-hash"
    assert user.totp_secret_encrypted is None
    assert user.mfa_enabled is False
    assert user.mfa_recovery_code_hash is None


def test_completed_registration_email_change_is_blocked():
    user = make_user(registration_status=RegistrationStatus.COMPLETED)

    assert user_service._is_completed_registration_email_change(
        user, "novo.gestor@ubi.pt"
    )
    assert not user_service._is_completed_registration_email_change(
        user, "gestor@ubi.pt"
    )


@pytest.mark.parametrize(
    "role",
    [UserRole.MANAGER, UserRole.ADMINISTRATOR, None],
)
def test_create_user_route_rejects_role_field(monkeypatch, role):
    app = Flask(__name__)
    monkeypatch.setattr(
        users.user_service,
        "create_gestor",
        lambda *args, **kwargs: pytest.fail("service must not be called"),
    )

    with app.test_request_context(
        "/api/users/",
        method="POST",
        json={"email": "gestor@ubi.pt", "location_ids": [1], "role": role},
    ):
        response, status = users.create_user.__wrapped__()

    assert status == 400
    assert response.get_json()["error"] == (
        "O campo role não pode ser definido por esta rota."
    )


@pytest.mark.parametrize(
    "role",
    [UserRole.MANAGER, UserRole.ADMINISTRATOR, None],
)
def test_update_user_route_rejects_role_field(monkeypatch, role):
    app = Flask(__name__)
    monkeypatch.setattr(
        users.user_service,
        "update_user",
        lambda *args, **kwargs: pytest.fail("service must not be called"),
    )

    with app.test_request_context(
        "/api/users/10",
        method="PUT",
        json={"email": "gestor@ubi.pt", "location_ids": [1], "role": role},
    ):
        response, status = users.update_user.__wrapped__(10)

    assert status == 400
    assert response.get_json()["error"] == (
        "O campo role não pode ser alterado por esta rota."
    )


def test_create_user_route_accepts_payload_without_role(monkeypatch):
    app = Flask(__name__)
    created_user = make_user(is_active=True)
    captured = {}

    def create_gestor(email, location_ids, admin_id):
        captured.update(
            email=email,
            location_ids=location_ids,
            admin_id=admin_id,
        )
        return True, "Utilizador criado.", created_user, 201

    monkeypatch.setattr(users, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(users.user_service, "create_gestor", create_gestor)
    monkeypatch.setattr(
        users.user_service,
        "user_to_dict",
        lambda user: {"email": user.email, "role": user.role},
    )

    with app.test_request_context(
        "/api/users/",
        method="POST",
        json={"email": "GESTOR@UBI.PT", "location_ids": [1]},
    ):
        response, status = users.create_user.__wrapped__()

    assert status == 201
    assert captured == {
        "email": "gestor@ubi.pt",
        "location_ids": [1],
        "admin_id": 1,
    }
    assert response.get_json()["data"]["role"] == UserRole.MANAGER.value


def test_update_user_route_accepts_payload_without_role(monkeypatch):
    app = Flask(__name__)
    updated_user = make_user(is_active=True)
    captured = {}

    def update_user(**kwargs):
        captured.update(kwargs)
        return True, "Utilizador atualizado.", updated_user

    monkeypatch.setattr(users, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(users.user_service, "update_user", update_user)
    monkeypatch.setattr(
        users.user_service,
        "user_to_dict",
        lambda user: {"email": user.email, "role": user.role},
    )

    with app.test_request_context(
        "/api/users/10",
        method="PUT",
        json={"email": "GESTOR@UBI.PT", "location_ids": [1]},
    ):
        response, status = users.update_user.__wrapped__(10)

    assert status == 200
    assert captured == {
        "user_id": 10,
        "email": "gestor@ubi.pt",
        "location_ids": [1],
        "admin_id": 1,
    }
    assert response.get_json()["data"]["role"] == UserRole.MANAGER.value


def test_create_pending_gestor_always_sets_gestor_role(monkeypatch):
    session = FakeSession([None])
    monkeypatch.setattr(user_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        user_service,
        "ph",
        SimpleNamespace(hash=lambda value: "random-password-hash"),
    )
    monkeypatch.setattr(
        user_service,
        "_get_active_locations",
        lambda location_ids: (True, "Salas válidas.", []),
    )
    monkeypatch.setattr(
        user_service,
        "issue_registration_token",
        lambda user: "registration-token",
    )
    monkeypatch.setattr(
        user_service,
        "_assign_locations_to_user",
        lambda user, locations: None,
    )
    monkeypatch.setattr(user_service, "log_action", lambda **kwargs: None)

    ok, _, user, token = user_service.create_pending_gestor(
        email="gestor@ubi.pt",
        location_ids=[],
        actor_id=1,
        require_locations=False,
    )

    assert ok
    assert user.role == UserRole.MANAGER
    assert token == "registration-token"


def test_update_user_preserves_gestor_role(monkeypatch):
    user = make_user(is_active=True)
    session = FakeSession([user, None])
    monkeypatch.setattr(user_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        user_service,
        "_get_active_locations",
        lambda location_ids: (True, "Salas válidas.", []),
    )
    monkeypatch.setattr(
        user_service,
        "_assign_locations_to_user",
        lambda user, locations: None,
    )
    monkeypatch.setattr(user_service, "log_action", lambda **kwargs: None)

    ok, _, updated_user = user_service.update_user(
        user_id=user.user_id,
        email=user.email,
        location_ids=[],
        admin_id=1,
    )

    assert ok
    assert updated_user.role == UserRole.MANAGER
    assert session.committed


def test_pending_gestor_email_change_reissues_registration_token(monkeypatch):
    user = make_user(
        is_active=True,
        registration_status=RegistrationStatus.PENDING,
    )
    session = FakeSession([user, None])
    issued_for = []
    emails_sent = []

    monkeypatch.setattr(user_service, "db", SimpleNamespace(session=session))
    monkeypatch.setattr(
        user_service,
        "_get_active_locations",
        lambda location_ids: (True, "Salas válidas.", []),
    )
    monkeypatch.setattr(
        user_service,
        "_assign_locations_to_user",
        lambda user, locations: None,
    )

    def issue_token(target):
        issued_for.append((target.user_id, target.email))
        target.registration_token_hash = "new-token-hash"
        return "new-registration-token"

    monkeypatch.setattr(user_service, "issue_registration_token", issue_token)
    monkeypatch.setattr(user_service, "log_action", lambda **kwargs: None)
    monkeypatch.setattr(
        user_service.email_service,
        "send_registration_email",
        lambda email, token: emails_sent.append((email, token)) or True,
    )

    ok, message, updated_user = user_service.update_user(
        user_id=user.user_id,
        email="novo.gestor@ubi.pt",
        location_ids=[],
        admin_id=1,
    )

    assert ok
    assert message == (
        "Utilizador atualizado com sucesso. Email de registo reenviado."
    )
    assert updated_user.user_id == user.user_id
    assert updated_user.email == "novo.gestor@ubi.pt"
    assert issued_for == [(user.user_id, "novo.gestor@ubi.pt")]
    assert emails_sent == [
        ("novo.gestor@ubi.pt", "new-registration-token")
    ]
    assert session.committed


def test_update_user_rejects_administrator(monkeypatch):
    admin = make_user(is_active=True, role=UserRole.ADMINISTRATOR)
    session = FakeSession([admin])
    monkeypatch.setattr(user_service, "db", SimpleNamespace(session=session))

    ok, message, updated_user = user_service.update_user(
        user_id=admin.user_id,
        email=admin.email,
        location_ids=[],
        admin_id=admin.user_id,
    )

    assert not ok
    assert message == "Apenas gestores podem ser editados por esta rota."
    assert updated_user is None
    assert not session.committed


def test_delete_user_rejects_administrator(monkeypatch):
    admin = make_user(is_active=True, role=UserRole.ADMINISTRATOR)
    session = FakeSession([admin])
    monkeypatch.setattr(user_service, "db", SimpleNamespace(session=session))

    ok, message, deleted_user = user_service.delete_user(
        user_id=admin.user_id,
        admin_id=99,
    )

    assert not ok
    assert message == "Apenas gestores podem ser removidos por esta rota."
    assert deleted_user is None
    assert not session.committed
