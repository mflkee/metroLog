# Proposal

## Why

On 2026-10-19 the production backend hung for 11 hours: two read requests left their database
transactions open, a full-table `UPDATE equipment` issued from the equipment read paths blocked
behind them, and because `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout`
were all `0` the chain of waits never broke — every request (including login and `/health/ready`)
stopped answering, so users saw an endless sign-in and Telegram kept paging about the readiness probe.

## What Changes

- Reading equipment no longer writes: the transient-status normalisation stops running inside
  `get_by_id`/`list_all`/`list_page`, so opening the registry or an equipment card is a pure read.
- The same self-heal runs **once at application start** (single-flight across the uvicorn workers)
  and continues to run on the mutation paths that change equipment status.
- A streaming (file download) response releases its database session **before** the file is sent.
- The database connection carries safety limits — `statement_timeout`, `lock_timeout`,
  `idle_in_transaction_session_timeout` — configurable in settings, so a stuck transaction is cut
  instead of hanging the service forever.

## Capabilities

### New Capabilities
- `database-resilience`: how the service keeps a database lock or a stalled transaction from freezing
  the whole application — read paths stay read-only, and connections carry statement/lock/idle limits.

### Modified Capabilities
<!-- None: no other capability's requirements change. -->

## Impact

- **Backend**: `app/repositories/equipment_repository.py` (no normalise on reads),
  `app/main.py` (one-shot self-heal at startup), `app/db/session.py` + `app/core/config.py`
  (connection timeouts), `app/api/v1/routes/equipment.py` (release the session before streaming).
- **Database**: no migration, no schema change.
- **Ops**: new settings (`DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`,
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`) with safe defaults; verify on Stage that the registry and the
  equipment card produce no `UPDATE equipment` in the log.
