import logging

import pytest
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
    assert "InvUBI" in sent_messages[0].html
    assert "Este email foi enviado automaticamente pelo InvUBI." in sent_messages[0].html
    assert "Concluir registo" in sent_messages[0].html
    assert "raw-registration-token" in sent_messages[0].body
    assert sent_messages[0].body.endswith(
        "Este email foi enviado automaticamente pelo InvUBI."
    )


@pytest.mark.parametrize(
    "send_email",
    [
        lambda: email_service.send_registration_email("user@ubi.pt", "registration-token"),
        lambda: email_service.send_maintenance_alert_email(
            "user@ubi.pt", 9, "SN-123", "19/06/2026"
        ),
        lambda: email_service.send_admin_transfer_email("user@ubi.pt"),
        lambda: email_service.send_admin_demoted_email("user@ubi.pt"),
        lambda: email_service.send_password_reset_email("user@ubi.pt", "reset-token"),
        lambda: email_service.send_password_reset_confirmation_email("user@ubi.pt"),
        lambda: email_service.send_password_change_confirmation_email("user@ubi.pt"),
        lambda: email_service.send_recovery_email_changed_old_address(
            "old@ubi.pt", "new@ubi.pt"
        ),
        lambda: email_service.send_recovery_email_changed_new_address(
            "new@ubi.pt", "old@ubi.pt"
        ),
        lambda: email_service.send_administrative_mfa_reset_email("user@ubi.pt"),
    ],
)
def test_all_email_templates_use_the_standard_layout(monkeypatch, send_email):
    app = make_app()
    sent_messages = []
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        assert send_email() is True

    message = sent_messages[0]
    assert message.body
    assert message.body.endswith(
        "Este email foi enviado automaticamente pelo InvUBI."
    )
    assert '<body style="margin:0;padding:0;background:#f3f4f6;">' in message.html
    assert "InvUBI</td>" in message.html
    assert "Este email foi enviado automaticamente pelo InvUBI." in message.html
    assert "<script" not in message.html
    assert "<style" not in message.html
    assert "<link" not in message.html
    assert "<img" not in message.html


def test_action_templates_include_button_and_fallback_link(monkeypatch):
    app = make_app()
    sent_messages = []
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        email_service.send_registration_email("user@ubi.pt", "registration-token")
        email_service.send_password_reset_email("user@ubi.pt", "reset-token")

    registration, password_reset = sent_messages
    assert "Concluir registo</a>" in registration.html
    assert "primeiro-acesso?token=registration-token" in registration.html
    assert "Se o botão não funcionar" in registration.html
    assert "Definir nova palavra-passe</a>" in password_reset.html
    assert "redefinir-palavra-passe?token=reset-token" in password_reset.html
    assert "Se o botão não funcionar" in password_reset.html


def test_maintenance_template_escapes_dynamic_details(monkeypatch):
    app = make_app()
    sent_messages = []
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        email_service.send_maintenance_alert_email(
            "user@ubi.pt",
            9,
            '<script>alert("serial")</script>',
            "<invalid-date>",
        )

    html = sent_messages[0].html
    assert "ID do ativo" in html
    assert "Nº de Série" in html
    assert "Data prevista" in html
    assert "&lt;script&gt;alert(&quot;serial&quot;)&lt;/script&gt;" in html
    assert "&lt;invalid-date&gt;" in html
    assert '<script>alert("serial")</script>' not in html


def test_email_subjects_distinguish_password_reset_from_password_change(monkeypatch):
    app = make_app()
    sent_messages = []
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        email_service.send_password_reset_confirmation_email("user@ubi.pt")
        email_service.send_password_change_confirmation_email("user@ubi.pt")

    password_reset, password_change = sent_messages
    assert password_reset.subject == "[InvUBI] Palavra-passe redefinida"
    assert password_change.subject == "[InvUBI] Palavra-passe alterada"


def test_action_template_escapes_dynamic_url(monkeypatch):
    app = make_app()
    sent_messages = []
    token = 'token"><script>alert(1)</script>'
    monkeypatch.setattr(
        email_service.mail,
        "send",
        lambda message: sent_messages.append(message),
    )

    with app.app_context():
        email_service.send_password_reset_email("user@ubi.pt", token)

    html = sent_messages[0].html
    assert "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert '<script>alert(1)</script>' not in html


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
