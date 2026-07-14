import base64
import binascii
import json
import os
import re
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import current_app


ENVELOPE_PREFIX = "totp"
ENVELOPE_VERSION = "v1"
ACTIVE_SECRET_PURPOSE = "user-active"
PENDING_SECRET_PURPOSE = "reconfiguration-pending"
ALLOWED_PURPOSES = frozenset(
    {
        ACTIVE_SECRET_PURPOSE,
        PENDING_SECRET_PURPOSE,
    }
)
KEY_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")
BASE64URL_PATTERN = re.compile(r"[A-Za-z0-9_-]+={0,2}")
NONCE_BYTES = 12
KEY_BYTES = 32


class TotpSecretError(Exception):
    """Raised when protected TOTP material cannot be safely processed."""


@dataclass(frozen=True)
class TotpEncryptionKeyring:
    active_key_id: str
    keys: dict[str, bytes]


def _decode_base64url(value: str) -> bytes:
    if (
        not isinstance(value, str)
        or not value
        or not BASE64URL_PATTERN.fullmatch(value)
    ):
        raise ValueError("empty base64url value")
    try:
        return base64.b64decode(
            value.encode("ascii"),
            altchars=b"-_",
            validate=True,
        )
    except (UnicodeEncodeError, binascii.Error, ValueError) as exc:
        raise ValueError("invalid base64url value") from exc


def _encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("TOTP_ENCRYPTION_KEYS_JSON contém IDs duplicados.")
        result[key] = value
    return result


def parse_keyring(active_key_id: str, keys_json: str) -> TotpEncryptionKeyring:
    if not isinstance(active_key_id, str) or not KEY_ID_PATTERN.fullmatch(
        active_key_id
    ):
        raise ValueError("TOTP_ENCRYPTION_ACTIVE_KEY_ID inválido.")

    if not isinstance(keys_json, str) or not keys_json.strip():
        raise ValueError("TOTP_ENCRYPTION_KEYS_JSON obrigatório.")

    try:
        raw_keys = json.loads(
            keys_json,
            object_pairs_hook=_unique_json_object,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError("TOTP_ENCRYPTION_KEYS_JSON contém JSON inválido.") from exc

    if not isinstance(raw_keys, dict) or not raw_keys:
        raise ValueError("TOTP_ENCRYPTION_KEYS_JSON deve ser um objeto não vazio.")

    keys: dict[str, bytes] = {}
    for key_id, encoded_key in raw_keys.items():
        if not isinstance(key_id, str) or not KEY_ID_PATTERN.fullmatch(key_id):
            raise ValueError("TOTP_ENCRYPTION_KEYS_JSON contém um ID inválido.")
        try:
            key = _decode_base64url(encoded_key)
        except ValueError as exc:
            raise ValueError(
                f"A chave TOTP '{key_id}' não está em Base64 URL-safe válido."
            ) from exc
        if len(key) != KEY_BYTES:
            raise ValueError(f"A chave TOTP '{key_id}' deve possuir 32 bytes.")
        keys[key_id] = key

    if active_key_id not in keys:
        raise ValueError(
            "TOTP_ENCRYPTION_ACTIVE_KEY_ID não existe no keyring configurado."
        )

    return TotpEncryptionKeyring(active_key_id=active_key_id, keys=keys)


def configure_totp_encryption(app) -> None:
    try:
        keyring = parse_keyring(
            app.config.get("TOTP_ENCRYPTION_ACTIVE_KEY_ID"),
            app.config.get("TOTP_ENCRYPTION_KEYS_JSON"),
        )
    except ValueError as exc:
        raise RuntimeError(f"Configuração de criptografia TOTP inválida: {exc}") from exc

    app.extensions["totp_encryption_keyring"] = keyring


def _get_keyring() -> TotpEncryptionKeyring:
    keyring = current_app.extensions.get("totp_encryption_keyring")
    if not isinstance(keyring, TotpEncryptionKeyring):
        raise TotpSecretError("Criptografia TOTP não configurada.")
    return keyring


def _associated_data(user_id: int, purpose: str) -> bytes:
    if not isinstance(user_id, int) or user_id <= 0:
        raise TotpSecretError("Contexto TOTP inválido.")
    if purpose not in ALLOWED_PURPOSES:
        raise TotpSecretError("Finalidade TOTP inválida.")
    return f"{ENVELOPE_PREFIX}:{ENVELOPE_VERSION}:{purpose}:user:{user_id}".encode(
        "ascii"
    )


def encrypt_totp_secret(secret: str, user_id: int, purpose: str) -> str:
    if not isinstance(secret, str) or not secret:
        raise TotpSecretError("Segredo TOTP inválido.")

    keyring = _get_keyring()
    nonce = os.urandom(NONCE_BYTES)
    aad = _associated_data(user_id, purpose)
    ciphertext = AESGCM(keyring.keys[keyring.active_key_id]).encrypt(
        nonce,
        secret.encode("utf-8"),
        aad,
    )
    return ":".join(
        (
            ENVELOPE_PREFIX,
            ENVELOPE_VERSION,
            keyring.active_key_id,
            _encode_base64url(nonce),
            _encode_base64url(ciphertext),
        )
    )


def decrypt_totp_secret(envelope: str, user_id: int, purpose: str) -> str:
    if not isinstance(envelope, str):
        raise TotpSecretError("Envelope TOTP inválido.")

    parts = envelope.split(":")
    if (
        len(parts) != 5
        or parts[0] != ENVELOPE_PREFIX
        or parts[1] != ENVELOPE_VERSION
        or not KEY_ID_PATTERN.fullmatch(parts[2])
    ):
        raise TotpSecretError("Envelope TOTP inválido.")

    keyring = _get_keyring()
    key = keyring.keys.get(parts[2])
    if key is None:
        raise TotpSecretError("Chave TOTP indisponível.")

    try:
        nonce = _decode_base64url(parts[3])
        ciphertext = _decode_base64url(parts[4])
    except ValueError as exc:
        raise TotpSecretError("Envelope TOTP inválido.") from exc

    if len(nonce) != NONCE_BYTES or len(ciphertext) <= 16:
        raise TotpSecretError("Envelope TOTP inválido.")

    try:
        plaintext = AESGCM(key).decrypt(
            nonce,
            ciphertext,
            _associated_data(user_id, purpose),
        )
        secret = plaintext.decode("utf-8")
    except (InvalidTag, UnicodeDecodeError, ValueError) as exc:
        raise TotpSecretError("Não foi possível autenticar o segredo TOTP.") from exc

    if not secret:
        raise TotpSecretError("Segredo TOTP inválido.")
    return secret
