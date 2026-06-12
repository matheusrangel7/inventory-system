import inspect

from flask import Flask

from app.routes import admin_transfer


def make_app():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    return app


def route_handler(handler):
    return inspect.unwrap(handler)


def test_existing_transfer_passes_password_and_totp_to_service(monkeypatch):
    app = make_app()
    captured = {}
    monkeypatch.setattr(admin_transfer, "get_current_user_id", lambda: 7)
    monkeypatch.setattr(
        admin_transfer.admin_transfer_service,
        "transfer_to_existing_admin",
        lambda **kwargs: captured.update(kwargs) or (True, "Transferida."),
    )
    monkeypatch.setattr(admin_transfer, "clear_auth_cookies", lambda response: response)

    with app.test_request_context(
        "/api/admin-transfer/existing",
        method="POST",
        json={
            "target_user_id": 9,
            "password": "current-password",
            "totp_code": "123456",
        },
    ):
        response = route_handler(admin_transfer.transfer_existing)()

    assert response.status_code == 200
    assert captured == {
        "current_admin_id": 7,
        "target_user_id": 9,
        "password": "current-password",
        "totp_code": "123456",
    }


def test_new_transfer_passes_password_and_totp_to_service(monkeypatch):
    app = make_app()
    captured = {}
    monkeypatch.setattr(admin_transfer, "get_current_user_id", lambda: 7)
    monkeypatch.setattr(
        admin_transfer.admin_transfer_service,
        "start_transfer_to_new_admin",
        lambda **kwargs: captured.update(kwargs)
        or (True, "Transferência iniciada.", {"transfer_id": 10}),
    )

    with app.test_request_context(
        "/api/admin-transfer/new",
        method="POST",
        json={
            "email": "NEW.ADMIN@UBI.PT",
            "password": "current-password",
            "totp_code": "654321",
        },
    ):
        response, status = route_handler(admin_transfer.transfer_new)()

    assert status == 201
    assert captured == {
        "current_admin_id": 7,
        "email": "new.admin@ubi.pt",
        "password": "current-password",
        "totp_code": "654321",
    }
    assert response.get_json()["data"]["transfer_id"] == 10


def test_transfer_routes_reject_missing_or_malformed_totp(monkeypatch):
    app = make_app()
    monkeypatch.setattr(
        admin_transfer.admin_transfer_service,
        "transfer_to_existing_admin",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("service must not be called")
        ),
    )

    for payload, expected_error in (
        (
            {"target_user_id": 9, "password": "current-password"},
            "Código TOTP obrigatório.",
        ),
        (
            {
                "target_user_id": 9,
                "password": "current-password",
                "totp_code": "12A456",
            },
            "Código TOTP deve conter 6 dígitos.",
        ),
    ):
        with app.test_request_context(
            "/api/admin-transfer/existing",
            method="POST",
            json=payload,
        ):
            response, status = route_handler(admin_transfer.transfer_existing)()

        assert status == 400
        assert response.get_json()["error"] == expected_error
