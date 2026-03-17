from __future__ import annotations

from fastapi import HTTPException, status

PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 6 characters long and include both letters and digits."
)


def validate_password_policy(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=PASSWORD_POLICY_MESSAGE,
        )

    has_letter = any(character.isalpha() for character in password)
    has_digit = any(character.isdigit() for character in password)

    if not has_letter or not has_digit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=PASSWORD_POLICY_MESSAGE,
        )
