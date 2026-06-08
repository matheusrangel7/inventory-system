from types import SimpleNamespace

import pytest
from flask import Flask, g

from app import _request_origin, _validate_security_config, create_app
from app.config import ProductionConfig
from app.domain.enums import UserRole
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
        role=UserRole.ADMINISTRATOR,
    )

    monkeypatch.setattr(
        auth,
        "get_mfa_step_claims",
        lambda: {"mfa_enrollment": True, "sub": "2"},
    )
    def fake_confirm_enrollment(user_id, code):
        calls["confirm"] = {"user_id": user_id, "code": code}
        return True, "MFA ativado."

    monkeypatch.setattr(
        auth.mfa_enrollment_service,
        "confirm_enrollment",
        fake_confirm_enrollment,
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
    assert calls["confirm"] == {"user_id": 2, "code": "123456"}


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


def test_production_rejects_in_memory_rate_limit_storage():
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="s" * 64,
        JWT_SECRET_KEY="j" * 64,
        JWT_COOKIE_SECURE=True,
        JWT_COOKIE_CSRF_PROTECT=True,
        REQUIRE_MUTATING_ORIGIN=True,
        RATELIMIT_STORAGE_URI="memory://",
        APP_DB_USER="app_user",
    )

    with pytest.raises(RuntimeError, match="RATELIMIT_STORAGE_URI"):
        _validate_security_config(app, "production")


def test_request_origin_uses_proxy_normalized_request_values():
    app = Flask(__name__)

    with app.test_request_context(
        "/api/test",
        base_url="https://trusted.example",
        headers={"X-Forwarded-Host": "attacker.example"},
    ):
        assert _request_origin() == "https://trusted.example"


def test_unknown_environment_fails_closed():
    with pytest.raises(RuntimeError, match="Ambiente Flask desconhecido"):
        create_app("prod")


def test_me_reuses_user_loaded_by_authentication_decorator(monkeypatch):
    app = make_app()
    user = SimpleNamespace(
        user_id=7,
        email="admin@ubi.pt",
        role=UserRole.ADMINISTRATOR,
        mfa_enabled=True,
    )
    monkeypatch.setattr(
        auth.auth_service,
        "get_active_completed_user",
        lambda user_id: pytest.fail("the /me route must not query the user again"),
    )

    with app.test_request_context("/api/auth/me"):
        g.current_user = user
        response, status = auth.me.__wrapped__()

    assert status == 200
    assert response.get_json()["data"]["user_id"] == 7
    assert response.get_json()["data"]["role"] == UserRole.ADMINISTRATOR.value
