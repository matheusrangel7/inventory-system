import inspect
from types import SimpleNamespace

from flask import Flask, g

from app.routes import auth


def make_app():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    return app


def route_handler(handler):
    return inspect.unwrap(handler)


def valid_claims():
    return {
        "sub": "7",
        "reconfiguration_id": 11,
        "password_fingerprint": "password-fingerprint",
        "totp_fingerprint": "totp-fingerprint",
        "access_jti": "current-access-jti",
    }


def test_start_route_returns_qr_and_sets_bound_cookie(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    captured = {}
    setup = auth.mfa_reconfiguration_service.ReconfigurationSetup(
        reconfiguration_id=11,
        otp_uri="otpauth://totp/pending",
        password_fingerprint="password-fingerprint",
        totp_fingerprint="totp-fingerprint",
    )
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "start_reconfiguration",
        lambda user_id, password, code: (
            captured.update(
                {"user_id": user_id, "password": password, "code": code}
            )
            or (True, "Identidade confirmada.", setup)
        ),
    )
    monkeypatch.setattr(auth, "_qr_code_data_uri", lambda value: f"qr:{value}")
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth,
        "set_mfa_reconfiguration_step_cookie",
        lambda response, user_id, reconfiguration_id, password_fp, totp_fp, access_jti: (
            captured.update(
                {
                    "cookie_user_id": user_id,
                    "reconfiguration_id": reconfiguration_id,
                    "password_fp": password_fp,
                    "totp_fp": totp_fp,
                    "access_jti": access_jti,
                }
            )
            or response
        ),
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/start",
        method="POST",
        json={"current_password": "Password1", "totp_code": "123456"},
    ):
        g.current_user = user
        response = route_handler(auth.start_mfa_reconfiguration)()

    assert response.status_code == 200
    assert response.get_json()["data"]["qr_code"] == "qr:otpauth://totp/pending"
    assert response.headers["Cache-Control"] == "no-store"
    assert captured == {
        "user_id": 7,
        "password": "Password1",
        "code": "123456",
        "cookie_user_id": 7,
        "reconfiguration_id": 11,
        "password_fp": "password-fingerprint",
        "totp_fp": "totp-fingerprint",
        "access_jti": "current-access-jti",
    }


def test_start_route_preserves_generic_confirmation_error(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "start_reconfiguration",
        lambda *args: (
            False,
            auth.mfa_reconfiguration_service.INVALID_CONFIRMATION_MESSAGE,
            None,
        ),
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/start",
        method="POST",
        json={"totp_code": "12A456"},
    ):
        g.current_user = user
        response, status = route_handler(auth.start_mfa_reconfiguration)()

    assert status == 400
    assert (
        response.get_json()["error"]
        == auth.mfa_reconfiguration_service.INVALID_CONFIRMATION_MESSAGE
    )


def test_complete_route_rejects_cookie_from_another_access_session(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    claims = valid_claims()
    claims["access_jti"] = "previous-access-jti"
    monkeypatch.setattr(
        auth,
        "get_mfa_reconfiguration_step_claims",
        lambda: claims,
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "complete_reconfiguration",
        lambda *args: (_ for _ in ()).throw(
            AssertionError("service must not be called")
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_mfa_reconfiguration_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/complete",
        method="POST",
        json={"totp_code": "654321"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_mfa_reconfiguration)()

    assert response.status_code == 400
    assert cleared == [True]


def test_invalid_new_code_keeps_valid_step_cookie(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_mfa_reconfiguration_step_claims",
        valid_claims,
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "complete_reconfiguration",
        lambda *args: (
            False,
            auth.mfa_reconfiguration_service.INVALID_NEW_CODE_MESSAGE,
            None,
            True,
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_mfa_reconfiguration_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/complete",
        method="POST",
        json={"totp_code": "000000"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_mfa_reconfiguration)()

    assert response.status_code == 400
    assert cleared == []


def test_complete_route_returns_recovery_code_and_clears_sessions(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_mfa_reconfiguration_step_claims",
        valid_claims,
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "complete_reconfiguration",
        lambda *args: (
            True,
            "Autenticador reconfigurado com sucesso.",
            "ABCD-EFGH-JKLM-NPQR",
            False,
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_auth_cookies",
        lambda response: cleared.append("auth") or response,
    )
    monkeypatch.setattr(
        auth,
        "clear_mfa_step_cookie",
        lambda response: cleared.append("mfa") or response,
    )
    monkeypatch.setattr(
        auth,
        "clear_mfa_reconfiguration_step_cookie",
        lambda response: cleared.append("reconfiguration") or response,
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/complete",
        method="POST",
        json={"totp_code": "654321"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_mfa_reconfiguration)()

    assert response.status_code == 200
    assert (
        response.get_json()["data"]["recovery_code"]
        == "ABCD-EFGH-JKLM-NPQR"
    )
    assert response.headers["Cache-Control"] == "no-store"
    assert cleared == ["auth", "mfa", "reconfiguration"]


def test_cancel_route_removes_pending_state_and_clears_cookie(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    calls = []
    monkeypatch.setattr(
        auth.mfa_reconfiguration_service,
        "cancel_reconfiguration",
        lambda user_id: calls.append(user_id) or (True, "Cancelada."),
    )
    monkeypatch.setattr(
        auth,
        "clear_mfa_reconfiguration_step_cookie",
        lambda response: calls.append("cleared") or response,
    )

    with app.test_request_context(
        "/api/auth/mfa-reconfiguration/cancel",
        method="POST",
    ):
        g.current_user = user
        response = route_handler(auth.cancel_mfa_reconfiguration)()

    assert response.status_code == 200
    assert calls == [7, "cleared"]
