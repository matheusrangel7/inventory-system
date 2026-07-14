from app.constants import MIN_PASSWORD_LENGTH


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < MIN_PASSWORD_LENGTH:
        return (
            False,
            f"A palavra-passe deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.",
        )
    if not any(character.isalpha() for character in password):
        return False, "A palavra-passe deve conter pelo menos uma letra."
    if not any(character.isdigit() for character in password):
        return False, "A palavra-passe deve conter pelo menos um número."
    return True, "Palavra-passe válida."
