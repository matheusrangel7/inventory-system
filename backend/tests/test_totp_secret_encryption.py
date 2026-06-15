import base64
import json

import pytest
from flask import Flask

from app import create_app
from app.config import DevelopmentConfig
from app.security.totp_secrets import (
    ACTIVE_SECRET_PURPOSE,
    PENDING_SECRET_PURPOSE,
    TotpSecretError,
    configure_totp_encryption,
    decrypt_totp_secret,
    encrypt_totp_secret,
    parse_keyring,
)


def encoded_key(character: bytes) -> str:
    return base64.urlsafe_b64encode(character * 32).decode("ascii")


def make_app(active_key_id="key-2", keys=None):
    app = Flask(__name__)
    app.config.update(
        TOTP_ENCRYPTION_ACTIVE_KEY_ID=active_key_id,
        TOTP_ENCRYPTION_KEYS_JSON=json.dumps(
            keys
            or {
                "key-1": encoded_key(b"a"),
                "key-2": encoded_key(b"b"),
            }
        ),
    )
    configure_totp_encryption(app)
    return app


def test_encrypts_with_active_key_and_random_nonce():
    app = make_app()

    with app.app_context():
        first = encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        )
        second = encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        )

        assert first.startswith("totp:v1:key-2:")
        assert second.startswith("totp:v1:key-2:")
        assert len(first) <= 255
        assert first != second
        assert "JBSWY3DPEHPK3PXP" not in first
        assert decrypt_totp_secret(first, 7, ACTIVE_SECRET_PURPOSE) == (
            "JBSWY3DPEHPK3PXP"
        )


def test_old_key_remains_readable_while_new_writes_use_active_key():
    old_app = make_app(active_key_id="key-1")
    with old_app.app_context():
        old_envelope = encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        )

    rotated_app = make_app(active_key_id="key-2")
    with rotated_app.app_context():
        assert decrypt_totp_secret(
            old_envelope,
            7,
            ACTIVE_SECRET_PURPOSE,
        ) == "JBSWY3DPEHPK3PXP"
        assert encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        ).startswith("totp:v1:key-2:")


@pytest.mark.parametrize(
    ("user_id", "purpose"),
    [
        (8, ACTIVE_SECRET_PURPOSE),
        (7, PENDING_SECRET_PURPOSE),
    ],
)
def test_ciphertext_is_bound_to_user_and_purpose(user_id, purpose):
    app = make_app()
    with app.app_context():
        envelope = encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        )
        with pytest.raises(TotpSecretError):
            decrypt_totp_secret(envelope, user_id, purpose)


def test_tampered_or_unknown_key_envelope_is_rejected():
    app = make_app()
    with app.app_context():
        envelope = encrypt_totp_secret(
            "JBSWY3DPEHPK3PXP",
            7,
            ACTIVE_SECRET_PURPOSE,
        )
        parts = envelope.split(":")
        tampered = ":".join((*parts[:4], f"{parts[4][:-2]}AA"))
        unknown_key = envelope.replace(":key-2:", ":missing:")

        with pytest.raises(TotpSecretError):
            decrypt_totp_secret(tampered, 7, ACTIVE_SECRET_PURPOSE)
        with pytest.raises(TotpSecretError):
            decrypt_totp_secret(unknown_key, 7, ACTIVE_SECRET_PURPOSE)


@pytest.mark.parametrize(
    ("active_key_id", "keys_json"),
    [
        ("", "{}"),
        ("missing", json.dumps({"key-1": encoded_key(b"a")})),
        ("key-1", "{invalid"),
        (
            "key-1",
            f'{{"key-1":"{encoded_key(b"a")}","key-1":"{encoded_key(b"b")}"}}',
        ),
        ("key-1", json.dumps({"key-1": encoded_key(b"a")[:-4]})),
        ("invalid:key", json.dumps({"invalid:key": encoded_key(b"a")})),
    ],
)
def test_invalid_keyring_configuration_is_rejected(active_key_id, keys_json):
    with pytest.raises(ValueError):
        parse_keyring(active_key_id, keys_json)


def test_application_fails_closed_without_totp_keyring(monkeypatch):
    monkeypatch.setattr(
        DevelopmentConfig,
        "TOTP_ENCRYPTION_ACTIVE_KEY_ID",
        None,
    )
    monkeypatch.setattr(
        DevelopmentConfig,
        "TOTP_ENCRYPTION_KEYS_JSON",
        None,
    )

    with pytest.raises(RuntimeError, match="criptografia TOTP"):
        create_app("development")
