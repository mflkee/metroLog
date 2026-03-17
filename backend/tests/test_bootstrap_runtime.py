from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.user_service import UserService
from app.utils.security import hash_password


def _build_bootstrap_user() -> User:
    return User(
        first_name=settings.bootstrap_admin_first_name,
        last_name=settings.bootstrap_admin_last_name,
        patronymic=settings.bootstrap_admin_patronymic or None,
        email=settings.bootstrap_admin_email,
        password_hash=hash_password(settings.bootstrap_admin_password),
        role=UserRole.ADMINISTRATOR,
        is_active=True,
        must_change_password=True,
    )


def test_bootstrap_admin_creation_tolerates_concurrent_insert(
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    with testing_session() as session:
        service = UserService(session)
        original_commit = session.commit
        state = {"failed_once": False}

        monkeypatch.setattr(service.users, "add", lambda user: user)

        def fake_commit() -> None:
            if not state["failed_once"]:
                state["failed_once"] = True
                with testing_session() as concurrent_session:
                    concurrent_session.add(_build_bootstrap_user())
                    concurrent_session.commit()
                raise IntegrityError("insert into users", {}, Exception("duplicate email"))

            original_commit()

        monkeypatch.setattr(session, "commit", fake_commit)

        user = service.ensure_bootstrap_admin()

    assert user is not None
    assert user.email == settings.bootstrap_admin_email
    assert user.role == UserRole.ADMINISTRATOR
    assert user.is_active is True


def test_bootstrap_admin_does_not_downgrade_developer(
    db_engine,
) -> None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    with testing_session() as session:
        developer = _build_bootstrap_user()
        developer.role = UserRole.DEVELOPER
        developer.is_active = False
        session.add(developer)
        session.commit()

    with testing_session() as session:
        user = UserService(session).ensure_bootstrap_admin()

    assert user is not None
    assert user.email == settings.bootstrap_admin_email
    assert user.role == UserRole.DEVELOPER
    assert user.is_active is True
