from types import SimpleNamespace

from flask import Flask

from app.config import ProductionConfig
from app.routes import auth


def make_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        JWT_COOKIE_CSRF_PROTECT=False,
    )
    return app


def test_enroll_mfa_setup_rejects_invalid_step_subject(monkeypatch):
    app = make_app()
    monkeypatch.setattr(
        auth,
        "get_mfa_step_claims",
        lambda: {"mfa_enrollment": True, "sub": "not-an-int"},
    )

    with app.test_request_context("/api/auth/enroll-mfa/setup", method="POST"):
        response, status = auth.enroll_mfa_setup()

    assert status == 401
    assert response.get_json()["error"] == (
        "Sessão de configuração MFA inválida ou expirada."
    )


def test_enroll_mfa_confirm_completes_pending_admin_transfer(monkeypatch):
    app = make_app()
    calls = {}
    user = SimpleNamespace(
        user_id=2,
        email="novo.admin@ubi.pt",
        role="Administrador",
    )

    monkeypatch.setattr(
        auth,
        "get_mfa_step_claims",
        lambda: {"mfa_enrollment": True, "sub": "2"},
    )
    monkeypatch.setattr(
        auth.admin_transfer_service,
        "has_pending_for_target",
        lambda user_id: True,
    )

    def fake_confirm_mfa_setup(user_id, code, commit=True):
        calls["confirm"] = {"user_id": user_id, "code": code, "commit": commit}
        return True, "MFA ativado."

    monkeypatch.setattr(auth.mfa_service, "confirm_mfa_setup", fake_confirm_mfa_setup)

    def fake_complete_pending_after_mfa(user_id):
        calls["complete_pending_after_mfa"] = user_id
        return True

    monkeypatch.setattr(
        auth.admin_transfer_service,
        "complete_pending_after_mfa",
        fake_complete_pending_after_mfa,
    )
    monkeypatch.setattr(
        auth.auth_service,
        "get_active_completed_user",
        lambda user_id: user,
    )
    monkeypatch.setattr(
        auth.session_service,
        "create_session",
        lambda user_id, ip, user_agent: "refresh-token",
    )
    monkeypatch.setattr(auth, "build_auth_response", lambda **kwargs: "auth-response")
    monkeypatch.setattr(auth, "clear_mfa_step_cookie", lambda response: response)

    with app.test_request_context(
        "/api/auth/enroll-mfa/confirm",
        method="POST",
        json={"code": "123456"},
    ):
        response = auth.enroll_mfa_confirm()

    assert response == "auth-response"
    assert calls["confirm"] == {"user_id": 2, "code": "123456", "commit": False}
    assert calls["complete_pending_after_mfa"] == 2


def test_refresh_clears_cookies_when_user_is_no_longer_valid(monkeypatch):
    app = make_app()
    monkeypatch.setattr(
        auth.session_service,
        "rotate_session",
        lambda refresh_token, ip, user_agent: (True, "new-refresh-token", 2),
    )
    monkeypatch.setattr(
        auth.auth_service,
        "get_active_completed_user",
        lambda user_id: None,
    )
    monkeypatch.setattr(auth, "clear_auth_cookies", lambda response: response)

    with app.test_request_context(
        "/api/auth/refresh",
        method="POST",
        headers={"Cookie": "refresh_token=old-refresh-token"},
    ):
        response = auth.refresh()

    assert response.status_code == 401
    assert response.get_json()["error"] == "Utilizador inválido."


def test_production_requires_mutating_origin_by_default():
    assert ProductionConfig.REQUIRE_MUTATING_ORIGIN is True
