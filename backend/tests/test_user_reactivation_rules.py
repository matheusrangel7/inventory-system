from types import SimpleNamespace

from app.routes import users
from app.services import user_service


def make_user(
    *,
    is_active=False,
    role="Gestor",
    registration_status="Pendente",
    mfa_enabled=False,
):
    return SimpleNamespace(
        is_active=is_active,
        role=role,
        registration_status=registration_status,
        mfa_enabled=mfa_enabled,
        password_hash="old-hash",
        totp_secret="old-secret",
        email="gestor@ubi.pt",
    )


def test_pending_inactive_gestor_can_be_reactivated():
    user = make_user()

    assert user_service._can_reactivate_inactive_gestor(user, allow_completed=False)


def test_completed_inactive_gestor_requires_explicit_allow_completed():
    user = make_user(registration_status="Concluído", mfa_enabled=True)

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
    user = make_user(role="Administrador")

    assert not user_service._can_reactivate_inactive_gestor(
        user, allow_completed=True
    )


def test_completed_gestor_reset_clears_old_credentials(monkeypatch):
    user = make_user(registration_status="Concluído", mfa_enabled=True)

    class DummyPasswordHasher:
        @staticmethod
        def hash(value):
            assert value
            return "new-random-hash"

    monkeypatch.setattr(user_service, "ph", DummyPasswordHasher())

    user_service._reset_completed_gestor_for_invite(user)

    assert user.password_hash == "new-random-hash"
    assert user.totp_secret is None
    assert user.mfa_enabled is False


def test_completed_registration_email_change_is_blocked():
    user = make_user(registration_status="Concluído")

    assert user_service._is_completed_registration_email_change(
        user, "novo.gestor@ubi.pt"
    )
    assert not user_service._is_completed_registration_email_change(
        user, "gestor@ubi.pt"
    )


def test_create_user_route_only_accepts_missing_or_gestor_role():
    assert users._is_allowed_create_user_role(None)
    assert users._is_allowed_create_user_role("Gestor")
    assert not users._is_allowed_create_user_role("Administrador")
    assert not users._is_allowed_create_user_role("Foo")
