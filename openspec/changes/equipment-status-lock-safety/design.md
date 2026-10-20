# Design

## Context

See `proposal.md` — Why.

The incident on 2026-10-19 was a lock chain, not a crash:

- `EquipmentRepository.normalize_transient_statuses()` was invoked from the three read paths
  (`get_by_id`, `list_all`, `list_page`) and issued
  `UPDATE equipment SET status=... WHERE status IN (IN_REPAIR, IN_VERIFICATION) ... RETURNING`.
- The request-scoped session (`app/db/session.py:get_db`) keeps its transaction open until the
  response is finished, so two requests (an equipment card and its attachment download) held row
  locks while doing non-database work.
- The next two requests blocked on those locks (`pg_blocking_pids` showed `54656 → 55381 → 41798`),
  and Postgres had no limits to break the chain: `statement_timeout = 0`, `lock_timeout = 0`,
  `idle_in_transaction_session_timeout = 0`.
- Both uvicorn workers (2 workers, synchronous SQLAlchemy) were stuck in that wait, so the whole
  application — including `/health/ready` and the login endpoint — stopped answering.

Status maintenance does **not** depend on the read-path normalisation: closing a repair or a
verification already calls `_sync_equipment_status` (`app/services/equipment_service.py`), so the
write-on-read is redundant belt-and-suspenders that only creates contention.

## Goals / Non-Goals

**Goals:**

- Opening the registry or an equipment card never takes a write lock.
- Stale transient statuses are still repaired automatically, without a write on the read path.
- A blocked statement or an abandoned transaction fails fast instead of hanging the service for hours.
- A file download does not pin a transaction for the length of the transfer.

**Non-Goals:**

- Re-architecting request/transaction scoping (session per request stays).
- Making the endpoints non-blocking (async driver, thread-pool offloading) — a separate concern.
- Changing the equipment status model or any user-visible status rule.

## Decisions

### 1. Reads stay read-only; the self-heal moves to start-up and mutation paths

Remove the three `normalize_transient_statuses()` calls from `EquipmentRepository`'s read methods.
Keep the method itself and run it once from the application lifespan, so leftovers from an earlier
failure (or from a code path that forgot to sync) are repaired on deploy.

The start-up run is single-flight: it takes `pg_try_advisory_lock` and skips when another worker
already holds it, because every uvicorn worker runs the lifespan. On SQLite (tests, local dev) the
lock is skipped and the normalisation simply runs.

**Alternative considered:** keep the normalise but make the `UPDATE` conditional on rows that actually
changed. Rejected: the statement still acquires `RowExclusiveLock` and a transaction id on every read
path, which is exactly the contention we are removing; and a no-op read would still look like a write
in the logs.

### 2. Timeouts on the connection, not on individual statements

`create_engine` gets `connect_args={"options": "-c statement_timeout=... -c lock_timeout=...
-c idle_in_transaction_session_timeout=..."}` for PostgreSQL URLs only (the tests use SQLite, where
these options do not exist). Values come from settings with these defaults:

| Setting | Default | Why |
|---|---|---|
| `DB_STATEMENT_TIMEOUT_MS` | 90000 (90 s) | Longer than the heaviest legit query (folder refresh previews), short enough to fail instead of hang |
| `DB_LOCK_TIMEOUT_MS` | 15000 (15 s) | Lock contention above that means a bug; the request should fail loudly |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | 600000 (10 min) | Covers a slow 25 MB attachment download; a genuinely abandoned transaction is cut |

**Alternative considered:** `ALTER SYSTEM` on the production database. Rejected as the primary fix —
it is invisible to the repository, drifts per host, and would not protect Stage or a fresh install.
The repository setting is the source of truth; a manual `ALTER SYSTEM` may still be applied as an
extra net.

### 3. Streaming responses release the session before sending bytes

`_build_file_response` gains the request session and closes it right before returning the streaming
response. FastAPI's dependency teardown closes it again, which is a no-op. This guarantees the
`idle_in_transaction_session_timeout` never has to fire for a legitimate slow download.

## Risks / Trade-offs

- **A stale status can survive until the next mutation or restart.** Accepted: mutations already sync
  the status, and the start-up pass covers leftovers; the previous design paid for this guarantee with
  a write lock on every screen open.
- **`lock_timeout` turns a very long wait into an HTTP 500.** Accepted, and it is the point: a 15 s
  wait is a defect worth a visible error, not a silent 11-hour freeze.
- **Two workers run the start-up normalisation.** Mitigated by the advisory lock.
