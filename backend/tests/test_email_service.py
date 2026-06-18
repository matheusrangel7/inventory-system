import logging

from flask import Flask

from app.services import email_service


def make_app():
    app = Flask(__name__)
    app.config.update(
        APP_BASE_URL="https://invubi.pt",
        MAIL_DEFAULT_SENDER="InvUBI <sistema@mail.invubi.pt>",
    )
    email_service.mail.init_app(app)
    return app


def test_send_registration_email_returns_true_when_delivery_succeeds(monkeypatch):
    app = make_app()
    sent_messages = []
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        result = email_service.send_registration_email(
            "utilizador@ubi.pt",
            "raw-registration-token",
        )

    assert result is True
    assert len(sent_messages) == 1
    assert sent_messages[0].recipients == ["utilizador@ubi.pt"]


def test_send_registration_email_masks_sensitive_values_on_failure(
    monkeypatch,
    caplog,
):
    app = make_app()
    token = "raw-registration-token"
    recipient = "utilizador@ubi.pt"

    def fail_send(_message):
        raise RuntimeError(
            "SMTP rejected https://invubi.pt/primeiro-acesso?token="
            f"{token} for {recipient}"
        )

    monkeypatch.setattr(email_service.mail, "send", fail_send)
    caplog.set_level(logging.ERROR)

    with app.app_context():
        result = email_service.send_registration_email(recipient, token)

    assert result is False
    logs = caplog.text
    assert "ut***@ubi.pt" in logs
    assert recipient not in logs
    assert token not in logs
    assert "primeiro-acesso" not in logs


def test_send_password_reset_email_masks_sensitive_values_on_failure(
    monkeypatch,
    caplog,
):
    app = make_app()
    token = "raw-password-reset-token"
    recipient = "gestor@ubi.pt"

    def fail_send(_message):
        raise RuntimeError(
            "SMTP rejected https://invubi.pt/redefinir-palavra-passe?token="
            f"{token} for {recipient}"
        )

    monkeypatch.setattr(email_service.mail, "send", fail_send)
    caplog.set_level(logging.ERROR)

    with app.app_context():
        result = email_service.send_password_reset_email(recipient, token)

    assert result is False
    logs = caplog.text
    assert "ge***@ubi.pt" in logs
    assert recipient not in logs
    assert token not in logs
    assert "redefinir-palavra-passe" not in logs


def test_mask_email_handles_invalid_values():
    assert email_service._mask_email("") == "***"
    assert email_service._mask_email("invalid") == "***"
    assert email_service._mask_email("a@ubi.pt") == "a***@ubi.pt"
    assert email_service._mask_email("ma@ubi.pt") == "ma***@ubi.pt"
