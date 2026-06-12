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


def test_confirm_route_sets_step_cookie_after_joint_confirmation(monkeypatch):
    app = make_app()
    captured = {}
    user = SimpleNamespace(user_id=7)
    monkeypatch.setattr(
        auth.password_change_service,
        "confirm_identity",
        lambda user_id, password, totp_code: (
            captured.update(
                {
                    "user_id": user_id,
                    "password": password,
                    "totp_code": totp_code,
                }
            )
            or (True, "Identidade confirmada.", "password-fingerprint")
        ),
    )
    monkeypatch.setattr(
        auth,
        "set_password_change_step_cookie",
        lambda response, user_id, fingerprint, access_jti: captured.update(
            {
                "cookie_user_id": user_id,
                "fingerprint": fingerprint,
                "access_jti": access_jti,
            }
        )
        or response,
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})

    with app.test_request_context(
        "/api/auth/password-change/confirm",
        method="POST",
        json={"current_password": "Password1", "totp_code": "123456"},
    ):
        g.current_user = user
        response = route_handler(auth.confirm_password_change)()

    assert response.status_code == 200
    assert captured == {
        "user_id": 7,
        "password": "Password1",
        "totp_code": "123456",
        "cookie_user_id": 7,
        "fingerprint": "password-fingerprint",
        "access_jti": "current-access-jti",
    }


def test_confirm_route_preserves_generic_error_for_malformed_input(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    monkeypatch.setattr(
        auth.password_change_service,
        "confirm_identity",
        lambda user_id, password, totp_code: (
            False,
            auth.password_change_service.INVALID_CONFIRMATION_MESSAGE,
            None,
        ),
    )

    with app.test_request_context(
        "/api/auth/password-change/confirm",
        method="POST",
        json={"totp_code": "12A456"},
    ):
        g.current_user = user
        response, status = route_handler(auth.confirm_password_change)()

    assert status == 400
    assert (
        response.get_json()["error"]
        == auth.password_change_service.INVALID_CONFIRMATION_MESSAGE
    )


def test_complete_route_rejects_step_for_another_user_and_clears_cookie(
    monkeypatch,
):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_password_change_step_claims",
        lambda: {
            "sub": "8",
            "password_change_confirmed": True,
            "password_fingerprint": "fingerprint",
            "access_jti": "other-access-jti",
        },
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth,
        "clear_password_change_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/password-change/complete",
        method="POST",
        json={"new_password": "NovaPassword1"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_password_change)()

    assert response.status_code == 400
    assert (
        response.get_json()["error"]
        == auth.password_change_service.INVALID_STEP_MESSAGE
    )
    assert cleared == [True]


def test_complete_route_rejects_step_from_previous_access_session(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_password_change_step_claims",
        lambda: {
            "sub": "7",
            "password_change_confirmed": True,
            "password_fingerprint": "fingerprint",
            "access_jti": "previous-access-jti",
        },
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.password_change_service,
        "complete_password_change",
        lambda *args: (_ for _ in ()).throw(
            AssertionError("service must not be called")
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_password_change_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/password-change/complete",
        method="POST",
        json={"new_password": "NovaPassword1"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_password_change)()

    assert response.status_code == 400
    assert cleared == [True]


def test_complete_route_clears_all_cookies_after_success(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_password_change_step_claims",
        lambda: {
            "sub": "7",
            "password_change_confirmed": True,
            "password_fingerprint": "fingerprint",
            "access_jti": "current-access-jti",
        },
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.password_change_service,
        "complete_password_change",
        lambda user_id, password, fingerprint: (
            True,
            "Palavra-passe alterada com sucesso.",
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
        "clear_password_change_step_cookie",
        lambda response: cleared.append("password-change") or response,
    )

    with app.test_request_context(
        "/api/auth/password-change/complete",
        method="POST",
        json={"new_password": "NovaPassword1"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_password_change)()

    assert response.status_code == 200
    assert cleared == ["auth", "mfa", "password-change"]


def test_complete_route_keeps_valid_step_for_correctable_password_error(
    monkeypatch,
):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_password_change_step_claims",
        lambda: {
            "sub": "7",
            "password_change_confirmed": True,
            "password_fingerprint": "fingerprint",
            "access_jti": "current-access-jti",
        },
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.password_change_service,
        "complete_password_change",
        lambda user_id, password, fingerprint: (
            False,
            "A nova palavra-passe deve ser diferente da atual.",
            True,
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_password_change_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/password-change/complete",
        method="POST",
        json={"new_password": "Password1"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_password_change)()

    assert response.status_code == 400
    assert cleared == []


def test_complete_route_clears_stale_confirmation(monkeypatch):
    app = make_app()
    user = SimpleNamespace(user_id=7)
    cleared = []
    monkeypatch.setattr(
        auth,
        "get_password_change_step_claims",
        lambda: {
            "sub": "7",
            "password_change_confirmed": True,
            "password_fingerprint": "stale",
            "access_jti": "current-access-jti",
        },
    )
    monkeypatch.setattr(auth, "get_jwt", lambda: {"jti": "current-access-jti"})
    monkeypatch.setattr(
        auth.password_change_service,
        "complete_password_change",
        lambda user_id, password, fingerprint: (
            False,
            auth.password_change_service.INVALID_STEP_MESSAGE,
            False,
        ),
    )
    monkeypatch.setattr(
        auth,
        "clear_password_change_step_cookie",
        lambda response: cleared.append(True) or response,
    )

    with app.test_request_context(
        "/api/auth/password-change/complete",
        method="POST",
        json={"new_password": "NovaPassword1"},
    ):
        g.current_user = user
        response = route_handler(auth.complete_password_change)()

    assert response.status_code == 400
    assert cleared == [True]
