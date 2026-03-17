from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture(autouse=True)
def disable_notification_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "notification_queue_enabled", False)


@pytest.fixture(autouse=True)
def stub_temporary_password_email(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_send_temporary_password_email(self, **kwargs):  # noqa: ANN001
        return None

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_temporary_password_email",
        fake_send_temporary_password_email,
    )


@pytest.fixture
def db_engine(tmp_path: Path) -> Engine:
    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite+pysqlite:///{database_path}",
        future=True,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
async def client(db_engine: Engine) -> AsyncClient:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    async def override_get_db():
        with testing_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client
    app.dependency_overrides.clear()
