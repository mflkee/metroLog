# Tasks

## 1. Stop writing on read

- [x] 1.1 Remove the `normalize_transient_statuses()` calls from `get_by_id`, `list_all` and `list_page` in `backend/app/repositories/equipment_repository.py`, keeping the method for explicit callers
- [x] 1.2 Cover it with a regression test in `backend/tests/test_equipment.py`: listing equipment and opening one equipment card issue no `UPDATE equipment` (count statements through a SQLAlchemy event listener)

## 2. Heal stale statuses outside the read path

- [x] 2.1 Run the normalisation once from the application lifespan in `backend/app/main.py`, single-flight via `pg_try_advisory_lock` (skipped on non-PostgreSQL dialects) and committed immediately
- [x] 2.2 Cover it with tests: a stale `IN_REPAIR` row with no active repair is normalised at start-up, and closing the last process still restores the working status on the mutation path

## 3. Bound database waits

- [x] 3.1 Add `db_statement_timeout_ms`, `db_lock_timeout_ms`, `db_idle_in_transaction_timeout_ms` to `backend/app/core/config.py` with the defaults from `design.md`
- [x] 3.2 Pass them as `connect_args["options"]` in `backend/app/db/session.py` for `postgresql` URLs only, and verify with a unit test that a PostgreSQL URL produces the three `-c` options while a SQLite URL produces none
- [x] 3.3 Confirm `alembic/env.py` builds its own engine from the URL, so migrations are not subject to the request timeouts

## 4. Do not hold a transaction while streaming

- [x] 4.1 Give `_build_file_response` in `backend/app/api/v1/routes/equipment.py` the request session and close it before returning the streaming response, updating every caller
- [x] 4.2 Verify with a test that downloading an attachment finishes with no open transaction on the request session

## 5. Documentation and rollout

- [x] 5.1 Record the rule in `AGENTS.md`: equipment reads must stay read-only, and the new timeout settings are the safety net
- [ ] 5.2 Run the full check suite through CI (ruff, pytest, eslint, vitest) on the pull request
- [ ] 5.3 On Stage: open the registry and an equipment card, confirm no `UPDATE equipment` appears in the backend log, and confirm attachments still download
