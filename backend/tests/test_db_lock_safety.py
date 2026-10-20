"""Regression tests for the 2026-10-19 lock chain that froze the backend for eleven hours.

Reading equipment used to issue a full-table `UPDATE equipment` (a write on every registry page and
every equipment card). Two requests then held row locks until their responses finished, the next
reads blocked behind them, and Postgres had no statement/lock/idle limits to break the chain, so the
whole service stopped answering — including login and the readiness probe.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.routes.equipment import _build_file_response
from app.core.config import settings
from app.db.session import build_engine_options
from app.main import normalize_equipment_statuses_once
from app.models.equipment import Equipment, EquipmentFolder, EquipmentStatus, EquipmentType
from app.services.user_service import UserService


def _seed_stale_equipment(db_engine: Engine, *, status: EquipmentStatus) -> tuple[int, int]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        folder = EquipmentFolder(name="Реестр блокировок")
        session.add(folder)
        session.flush()
        equipment = Equipment(
            folder_id=folder.id,
            object_name="Объект",
            name="Прибор",
            equipment_type=EquipmentType.OTHER,
            status=status,
        )
        session.add(equipment)
        session.commit()
        return folder.id, equipment.id


async def _login_admin(client: AsyncClient, db_engine: Engine) -> str:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        UserService(session).ensure_bootstrap_admin()
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.bootstrap_admin_email,
            "password": settings.bootstrap_admin_password,
        },
    )
    assert response.status_code == 200
    return str(response.json()["access_token"])


@pytest.mark.anyio
async def test_equipment_reads_issue_no_equipment_update(
    client: AsyncClient,
    db_engine: Engine,
) -> None:
    folder_id, equipment_id = _seed_stale_equipment(db_engine, status=EquipmentStatus.IN_REPAIR)
    token = await _login_admin(client, db_engine)
    headers = {"Authorization": f"Bearer {token}"}

    statements: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.split()).lower())

    event.listen(db_engine, "before_cursor_execute", _capture)
    try:
        page = await client.get(
            f"/api/v1/equipment/page?folder_id={folder_id}&limit=100&offset=0",
            headers=headers,
        )
        detail = await client.get(f"/api/v1/equipment/{equipment_id}/details", headers=headers)
    finally:
        event.remove(db_engine, "before_cursor_execute", _capture)

    assert page.status_code == 200
    assert detail.status_code == 200
    writes = [item for item in statements if item.startswith("update equipment")]
    assert writes == [], f"equipment reads must stay read-only, saw: {writes}"


@pytest.mark.anyio
async def test_equipment_read_reports_the_stored_status(
    client: AsyncClient,
    db_engine: Engine,
) -> None:
    """Reads no longer rewrite statuses, so the stored value is what the client gets."""

    _, equipment_id = _seed_stale_equipment(db_engine, status=EquipmentStatus.IN_REPAIR)
    token = await _login_admin(client, db_engine)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get(f"/api/v1/equipment/{equipment_id}/details", headers=headers)

    assert response.status_code == 200
    assert response.json()["equipment"]["status"] == "IN_REPAIR"


def test_startup_normalizes_stale_transient_statuses(db_engine: Engine) -> None:
    _, equipment_id = _seed_stale_equipment(db_engine, status=EquipmentStatus.IN_VERIFICATION)
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    with testing_session() as session:
        performed = normalize_equipment_statuses_once(session)

    assert performed is True
    with testing_session() as session:
        assert session.get(Equipment, equipment_id).status == EquipmentStatus.IN_WORK


def test_startup_heals_stale_verification_status(db_engine: Engine) -> None:
    _, equipment_id = _seed_stale_equipment(db_engine, status=EquipmentStatus.IN_WORK)
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        equipment = session.get(Equipment, equipment_id)
        equipment.status = EquipmentStatus.IN_VERIFICATION
        session.commit()

    with testing_session() as session:
        assert normalize_equipment_statuses_once(session) is True

    with testing_session() as session:
        # No active verification exists, so the transient status is stale and gets healed.
        assert session.get(Equipment, equipment_id).status == EquipmentStatus.IN_WORK


def test_postgres_engine_options_carry_time_limits() -> None:
    options = build_engine_options("postgresql+psycopg://metrolog:metrolog@db:5432/metrolog")

    connect_args = options["connect_args"]
    assert isinstance(connect_args, dict)
    statement_options = str(connect_args["options"])
    assert f"statement_timeout={settings.db_statement_timeout_ms}" in statement_options
    assert f"lock_timeout={settings.db_lock_timeout_ms}" in statement_options
    assert (
        f"idle_in_transaction_session_timeout={settings.db_idle_in_transaction_timeout_ms}"
        in statement_options
    )


def test_sqlite_engine_options_have_no_server_timeouts() -> None:
    options = build_engine_options("sqlite+pysqlite:////tmp/test.db")

    assert "connect_args" not in options
    assert options["pool_pre_ping"] is True


def test_file_response_releases_the_session_before_streaming(
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    file_path = tmp_path / "attachment.txt"
    file_path.write_text("payload", encoding="utf-8")
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    with testing_session() as session:
        session.execute(text("SELECT 1"))
        assert session.in_transaction() is True

        response = _build_file_response(
            db=session,
            file_path=file_path,
            media_type="text/plain",
            download_name="attachment.txt",
        )

        assert isinstance(session, Session)
        assert session.in_transaction() is False
        assert response.headers["Content-Length"] == str(len("payload"))
