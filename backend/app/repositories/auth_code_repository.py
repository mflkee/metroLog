from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_code import AuthCode, AuthCodeType


class AuthCodeRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, auth_code: AuthCode) -> AuthCode:
        self.session.add(auth_code)
        self.session.flush()
        return auth_code

    def invalidate_active_codes(self, *, user_id: int, code_type: AuthCodeType) -> None:
        statement = select(AuthCode).where(
            AuthCode.user_id == user_id,
            AuthCode.code_type == code_type,
            AuthCode.consumed_at.is_(None),
        )
        for auth_code in self.session.scalars(statement):
            auth_code.consumed_at = datetime.now(tz=UTC)

    def get_active_code(
        self,
        *,
        user_id: int,
        code_type: AuthCodeType,
        code_hash: str,
    ) -> AuthCode | None:
        now = datetime.now(tz=UTC)
        statement = (
            select(AuthCode)
            .where(
                AuthCode.user_id == user_id,
                AuthCode.code_type == code_type,
                AuthCode.code_hash == code_hash,
                AuthCode.consumed_at.is_(None),
                AuthCode.expires_at >= now,
            )
            .order_by(AuthCode.created_at.desc(), AuthCode.id.desc())
        )
        return self.session.scalar(statement)
