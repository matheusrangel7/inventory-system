import inspect
from types import SimpleNamespace

from flask import Flask

from app.routes import users


def make_app():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    return app


def route_handler(handler):
    return inspect.unwrap(handler)


def test_email_recovery_route_passes_joint_confirmation(monkeypatch):
    app = make_app()
    captured = {}
    target = SimpleNamespace(user_id=9)
    monkeypatch.setattr(users, "get_current_user_id", lambda: 7)
    monkeypatch.setattr(
        users.admin_account_recovery_service,
        "change_email",
        lambda **kwargs: captured.update(kwargs)
        or (True, "Email alterado.", target, 200),
    )
    monkeypatch.setattr(
        users.user_service,
        "user_to_dict",
        lambda user: {"user_id": user.user_id},
    )

    with app.test_request_context(
        "/api/users/9/access-recovery/email",
        method="POST",
        json={
            "new_email": "NEW@UBI.PT",
            "password": "Password1",
            "totp_code": "123456",
        },
    ):
        response, status = route_handler(users.recover_access_email)(9)

    assert status == 200
    assert captured == {
        "administrator_id": 7,
        "target_user_id": 9,
        "new_email": "NEW@UBI.PT",
        "password": "Password1",
        "totp_code": "123456",
    }


def test_password_and_mfa_routes_use_same_credentials_contract(monkeypatch):
    app = make_app()
    captured = []
    target = SimpleNamespace(user_id=9)
    monkeypatch.setattr(users, "get_current_user_id", lambda: 7)
    monkeypatch.setattr(
        users.user_service,
        "user_to_dict",
        lambda user: {"user_id": user.user_id},
    )
    monkeypatch.setattr(
        users.admin_account_recovery_service,
        "request_password_reset",
        lambda **kwargs: captured.append(("password", kwargs))
        or (True, "Link enviado.", target, 200),
    )
    monkeypatch.setattr(
        users.admin_account_recovery_service,
        "reset_mfa",
        lambda **kwargs: captured.append(("mfa", kwargs))
        or (True, "MFA redefinido.", target, 200),
    )

    for handler in (
        users.recover_access_password,
        users.recover_access_mfa,
    ):
        with app.test_request_context(
            "/api/users/9/access-recovery/action",
            method="POST",
            json={"password": "Password1", "totp_code": "654321"},
        ):
            response, status = route_handler(handler)(9)
        assert status == 200

    expected = {
        "administrator_id": 7,
        "target_user_id": 9,
        "password": "Password1",
        "totp_code": "654321",
    }
    assert captured == [
        ("password", expected),
        ("mfa", expected),
    ]


def test_missing_credentials_preserve_generic_service_error(monkeypatch):
    app = make_app()
    monkeypatch.setattr(users, "get_current_user_id", lambda: 7)
    monkeypatch.setattr(
        users.admin_account_recovery_service,
        "reset_mfa",
        lambda **kwargs: (
            False,
            "Credenciais de confirmação inválidas.",
            None,
            400,
        ),
    )

    with app.test_request_context(
        "/api/users/9/access-recovery/mfa-reset",
        method="POST",
        json={},
    ):
        response, status = route_handler(users.recover_access_mfa)(9)

    assert status == 400
    assert response.get_json()["error"] == (
        "Credenciais de confirmação inválidas."
    )


def test_recovery_routes_share_one_rate_limit_decorator():
    source = inspect.getsource(users)

    assert source.count("@access_recovery_limit") == 3
    assert 'scope="admin-account-recovery"' in source
