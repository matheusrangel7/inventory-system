import pytest

from app.services.password_service import validate_password


@pytest.mark.parametrize(
    ("password", "expected_fragment"),
    [
        ("Abc123", "8 caracteres"),
        ("12345678", "letra"),
        ("abcdefgh", "número"),
    ],
)
def test_password_validation_rejects_weak_values(password, expected_fragment):
    ok, message = validate_password(password)

    assert not ok
    assert expected_fragment in message


def test_password_validation_accepts_current_policy():
    ok, _ = validate_password("Password1")

    assert ok
