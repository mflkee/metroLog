from collections.abc import AsyncGenerator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def build_engine_options(database_url: str) -> dict[str, object]:
    """Connection options for the application engine.

    Postgres gets explicit statement/lock/idle limits so a blocked statement or an abandoned
    transaction fails (or is terminated) instead of holding locks forever and freezing the whole
    service — see the 2026-10-19 incident, where such a chain hung the backend for eleven hours.
    Other dialects (SQLite in tests) do not understand these server options.
    """

    options: dict[str, object] = {"future": True, "pool_pre_ping": True}
    if not database_url.startswith("postgresql"):
        return options
    options["connect_args"] = {
        "options": " ".join(
            [
                f"-c statement_timeout={int(settings.db_statement_timeout_ms)}",
                f"-c lock_timeout={int(settings.db_lock_timeout_ms)}",
                "-c idle_in_transaction_session_timeout="
                f"{int(settings.db_idle_in_transaction_timeout_ms)}",
            ]
        )
    }
    return options


engine = create_engine(settings.database_url, **build_engine_options(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


async def get_db() -> AsyncGenerator[Session, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
