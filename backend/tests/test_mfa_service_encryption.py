import base64
import json
from types import SimpleNamespace

import pyotp
from flask import Flask

from app.security.totp_secrets import (
    ACTIVE_SECRET_PURPOSE,
    TotpSecretError,
    configure_totp_encryption,
    decrypt_totp_secret,
)
from app.services import mfa_service


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.committed = False
        self.rolled_back = False

    def get(self, model, user_id):
        return self.user

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def make_app():
    key = base64.urlsafe_b64encode(b"m" * 32).decode("ascii")
    app = Flask(__name__)
    app.config.update(
        TOTP_ENCRYPTION_ACTIVE_KEY_ID="test-key",
        TOTP_ENCRYPTION_KEYS_JSON=json.dumps({"test-key": key}),
    )
    configure_totp_encryption(app)
    return app


def test_enrollment_persists_only_encrypted_secret(monkeypatch):
    app = make_app()
    user = SimpleNamespace(
        user_id=7,
        email="user@example.com",
        is_active=True,
        mfa_enabled=False,
        totp_secret_encrypted=None,
    )
    session = FakeSession(user)
    secret = "JBSWY3DPEHPK3PXP"
    monkeypatch.setattr(
        mfa_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(mfa_service.pyotp, "random_base32", lambda: secret)

    with app.app_context():
        ok, message, otp_uri = mfa_service.setup_mfa(user.user_id)
        decrypted = decrypt_totp_secret(
            user.totp_secret_encrypted,
            user.user_id,
            ACTIVE_SECRET_PURPOSE,
        )

    assert ok
    assert message == "QR Code gerado."
    assert secret in otp_uri
    assert user.totp_secret_encrypted.startswith("totp:v1:test-key:")
    assert secret not in user.totp_secret_encrypted
    assert decrypted == secret
    assert session.committed


def test_user_totp_is_verified_from_encrypted_secret():
    app = make_app()
    secret = "JBSWY3DPEHPK3PXP"

    with app.app_context():
        encrypted = mfa_service.encrypt_totp_secret(
            secret,
            7,
            ACTIVE_SECRET_PURPOSE,
        )
        user = SimpleNamespace(
            user_id=7,
            totp_secret_encrypted=encrypted,
        )
        code = pyotp.TOTP(secret).now()
        invalid_code = f"{(int(code) + 1) % 1_000_000:06d}"

        assert mfa_service.verify_user_totp(user, code)
        assert not mfa_service.verify_user_totp(user, invalid_code)


def test_enrollment_rolls_back_when_encryption_fails(monkeypatch):
    user = SimpleNamespace(
        user_id=7,
        email="user@example.com",
        is_active=True,
        mfa_enabled=False,
        totp_secret_encrypted=None,
    )
    session = FakeSession(user)
    monkeypatch.setattr(
        mfa_service,
        "db",
        SimpleNamespace(session=session),
    )
    monkeypatch.setattr(
        mfa_service,
        "encrypt_totp_secret",
        lambda *args: (_ for _ in ()).throw(TotpSecretError()),
    )

    ok, message, otp_uri = mfa_service.setup_mfa(user.user_id)

    assert not ok
    assert message == "Não foi possível iniciar a configuração MFA."
    assert otp_uri is None
    assert user.totp_secret_encrypted is None
    assert session.rolled_back
    assert not session.committed
