# Findings

Severity: `MAJOR` (correctness/security/data), `MINOR` (robustness/performance), `INFO`.

## Baseline (task 1)

Recorded on 2026-10-08, `main` at `b131669`, local `archlinux-notebook`.

| Metric | Value | Command |
|---|---|---|
| Backend lint (ruff) | clean - "All checks passed!" | `npm run lint:backend` |
| Backend tests | 139 passed, 3 warnings | `npm run test:backend` |
| Backend coverage | **82%** (9,653 statements, 1,740 missed) | `npm run test:backend` |
| Backend mypy | **81 errors in 8 files** (56 source files checked) | `uv run --directory backend mypy app` |
| Frontend lint (eslint) | clean | `npm run lint:frontend` |
| Frontend tests | 10 passed / 6 files (all `src/lib/*`) | `npm run test:frontend` |
| Frontend coverage | **1.84%** statements, 44.82% branches, 15.6% functions | `npm run test:frontend -- --run --coverage` |
| Frontend build | ok, `vendor` 322.61 kB (gzip 102.14 kB) | `npm run build:frontend` |

## Access-control matrix (task 2.1)

Extracted from `backend/app/api/v1/routes/` on 2026-10-08: **122 routes** (49 `GET`,
35 `POST`, 19 `PATCH`, 17 `DELETE`, 2 `PUT`).

Route-level dependencies (the 403 gates):

| Dependency | Count |
|---|---|
| `CurrentUser` (any authenticated user) | 71 |
| `OperatorUser` (`403` for non-operators) | 38 |
| `AdminUser` (`403` for non-admins) | 10 |
| none | 3 |

Routes with no dependency: `POST /auth/login`, `GET /health`, `GET /health/ready` - correct
by design. The per-route listing was produced by `/tmp/opencode/route_matrix.py` and
reviewed route by route.

Mutations: 36 gated by `OperatorUser`, 8 by `AdminUser`, 28 declared `CurrentUser` only. All
28 were reviewed individually; none is an unprotected write:

| Routes (all `CurrentUser`) | Guard that protects them |
|---|---|
| equipment `POST/PATCH/DELETE .../comments`, `.../attachments`, `.../comment-uploads` | `get_equipment()` -> `_assert_folder_access` (404); `_assert_comment_owner`, `_assert_comment_delete_access`, `has_admin_access` (403); `_assert_private_note_creation_allowed` (403 for `CUSTOMER`) |
| equipment `POST .../share`, `PUT .../process-subscription` | `get_equipment()` folder scoping; share recipients limited to users visible to the folder |
| equipment `POST ""` (create) | per-folder validation, 404 for a forbidden folder (covered by `tests/test_equipment.py`) |
| tasks (create/patch/delete, checklist, messages, attachments, subscription) | `_get_task_or_404` -> `_assert_folder_access` (404); `_assert_can_mutate` (403) |
| auth `PATCH /me`, `POST /change-password`, `POST /test-mention-email` | self-service, act on the caller only |
| arshin `POST /search`, `POST /esi/detail` | read-only lookups, no user data |

Reads are scoped centrally: `list_folders`, `list_groups`, `list_equipment[_page]`,
`list_verification_queue[_page]`, `list_repair_queue[_page]` all pass
`allowed_folder_ids=self._get_accessible_folder_ids()`; every single-item read goes through
`get_equipment()`; archive exports and the event journal pass folder scope too.

Result: **one gap found** (`GET /users/mentions`, F-006) and fixed; no missing role check and
no missing folder scope elsewhere. Tasks 2.2 and 2.3 therefore required no further fixes, and
2.4 was confirmed by the existing private-note tests.

## Findings

### F-001 (MINOR) - The pipeline never runs tests

`ci.yml` builds images and deploys, but runs neither `pytest` nor `vitest`. Tests
execute only through `npm run check` on a developer machine, and pre-commit runs only
`ruff` and `eslint`. A change that breaks tests still ships.

- Evidence: `.github/workflows/ci.yml` contains no test invocation.
- Owner: audit-and-fix (tooling baseline, tasks 1.2/1.4) plus a CI job.

### F-002 (MINOR) - Mypy reports 81 errors that were never triaged

Mypy is configured in `backend/pyproject.toml` but is not part of `check.sh` or CI, so 81
real errors accumulated unnoticed. Representative examples:

- `app/api/v1/routes/equipment.py:307` - `_persist_upload_to_temp_file` receives
  `starlette...UploadFile | str` where `fastapi...UploadFile` is expected.
- `app/api/v1/routes/equipment.py:314-315` - multipart form fields forwarded with
  `UploadFile | str` types into a request schema expecting `str`/`bool`.

These are type-level symptoms of the multipart handling in `routes/equipment.py`, which is
also on the access-control and validation review lists.

- Owner: audit-and-fix, tasks 2/3 (fix as files are touched), and the tooling baseline.

### F-003 (MINOR) - Frontend coverage is effectively zero

Frontend tests cover only `src/lib/*`; the statement baseline is 1.84% (589/31,914).
Every page, api module and store is untested, so frontend state defects cannot be caught
by the pipeline.

- Owner: audit-and-fix (task 5) for the audited areas; broader coverage is follow-up work.

### F-004 (INFO) - A "test email" endpoint is exposed in production

`POST /auth/test-mention-email` sends a notification email and is reachable by any
authenticated user, including `CUSTOMER`. It backs the "Тестовое письмо" button in Settings
(`src/pages/SettingsPage.tsx`), and the email goes to the caller's own address, so it is an
intentional self-service feature rather than a leak. Recorded so the exposure is a conscious
decision.

- Owner: audit-and-fix (recorded; no change).

### F-005 (INFO) - No rate limiting on outbound email

The application has no rate limiting (`slowapi`/`limits` are absent). `POST
/auth/test-mention-email` and `POST /equipment/{id}/share` trigger outbound email without a
throttle. Impact is bounded (self-send; share is limited to users visible to the folder), but
one authenticated account can generate unbounded email volume.

- Owner: follow-up change (out of scope for a patch release).

### F-006 (MINOR) - `GET /users/mentions` disclosed the whole user directory

Any authenticated user, including `CUSTOMER`, received `id`, `display_name` and **`email` for
every active user** in the installation. `UserService.list_mention_users()` called
`users.list_active()` and, unlike `task_service` (which filters mention candidates with
`has_operator_access`) or the share-recipient flow (limited to users visible to the folder),
applied no scope at all. The frontend uses this endpoint for `@`-autocomplete, so a customer
account could enumerate the organisation's email addresses.

- Fix: `list_mention_users(*, current_user)` now filters candidates through
  `_filter_mention_candidates` - administrators and developers see everyone; other roles see
  only users who share at least one accessible folder with them.
- Spec delta: `access-control` gained "Mention candidates are scoped to the caller".
- Test: `backend/tests/test_tasks.py::test_mention_candidates_are_scoped_to_callers_folders`.
- Verification: full backend suite `140 passed` (was 139).

