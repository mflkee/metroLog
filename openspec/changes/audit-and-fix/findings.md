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

### F-007 (MINOR) - Deep-linking to one process loaded the entire queue

The target-navigation flow of `RepairsPage` and `VerificationPage` (`?repairId=`,
`?verificationId=`, `?batchKey=`, `?equipmentId=`) called the unpaged `/equipment/repairs`
and `/equipment/verifications` endpoints, which return **every group in the caller's scope**.
On a large installation the browser received the whole active/archived queue and rendered it,
the unbounded query shape flagged in `AGENTS.md`.

- Fix: the unpaged endpoints accept `repair_id` / `verification_id`, `batch_key` and
  `equipment_id`; the repository resolves the matching group keys with a bounded scalar
  subquery and returns only those groups. Both pages pass the target from the URL and key
  their query on it.
- Test: `backend/tests/test_equipment.py::test_repair_queue_deep_link_filters_to_the_target_group`
  (unbounded = 3 items, `batch_key` = 2, `repair_id` / `equipment_id` = 1).
- Verification: full suite `141 passed` (was 140).

N+1 review (task 3.1): the queue statements fetch `Repair`/`Verification`, `Equipment` and
`SIVerification` in one join, with `has_active_repair` / `has_active_verification` as `EXISTS`
subqueries; `_build_*_queue_item` performs no per-row queries beyond the cached
per-folder deadline presets. No N+1 was found.

## Backend correctness and performance review (tasks 3.1-3.4)

- **3.2 background folder refresh.** `process_folder_refresh_task` sets `PROCESSING`, resets the
  counters and deletes the task's previous rows before rebuilding, so a rerun is idempotent; any
  failure sets `FAILED` with `error_message` and `completed_at`; `apply` answers `409` while the
  task is `PENDING`/`PROCESSING`. The background entry points open their own `SessionLocal` and
  build the service without `access_user` (unscoped) on purpose - the scan is already bounded to
  the task's own folder. No defect found; idempotency is asserted by the rerun step added to the
  existing `test_folder_refresh_*` test.
- **3.3 attachments and export/import.** Uploads are streamed with a 25 MB cap (413 on overflow,
  already covered by tests in `test_equipment.py` and `test_tasks.py`); file names are reduced with
  `Path(value).name`, so directory components cannot escape the storage directory; images are
  re-encoded under `attachment_image_target_size_bytes` / `attachment_image_max_dimension_pixels`.
  One remaining note: F-008.
- **3.4 indexes.** The audited queries are already backed by partial indexes
  (`ix_repairs_active_queue_order`, `ix_repairs_archived_queue_order`,
  `ix_repairs_active_equipment_lookup`, `ix_repairs_active_batch_lookup` and the `verifications`
  equivalents) plus `folder_id`, `equipment_id` and `batch_key` indexes. No migration is needed.

### F-008 (INFO) - Attachment content types are not restricted

Any file type may be attached; size, empty-file and storage-directory safety are enforced, but
there is no extension or MIME allowlist. Acceptable for an internal tool, worth a conscious
decision if attachments are ever served inline rather than downloaded.

- Owner: follow-up change (out of scope for a patch release).

### F-009 (MINOR) - An expired session left the interface in a dead state

`apiRequest` threw `ApiError` and nothing reacted to `401`, so once the 12-hour token expired
mid-session every request failed and the page showed errors while the app still considered the
user signed in. Only a manual re-login recovered.

- Fix: `client.ts` gained `setUnauthorizedHandler` and a `silentUnauthorized` option; on a `401`
  the registered handler clears the session (`src/lib/sessionExpiry.ts`, registered from
  `main.tsx`), and the existing `RequireAuth` / `RequireRoles` guards perform the redirect to
  `/login` with the reason from `buildLoginRedirectState`. The login request opts out, so a wrong
  password cannot loop.
- Tests: `src/api/client.test.ts` (5 cases) and `src/lib/sessionExpiry.test.ts` (2 cases);
  frontend suite `10 -> 17 passed`.
- Also added a `window.localStorage` shim to `src/test/setup.ts`, which the jsdom environment
  lacks while the auth/theme stores read it at import time.

## Frontend authorization matrix (task 4.1)

Every role-conditional control was checked against its backend guard:

| UI control | Frontend gate | Backend guard | Verdict |
|---|---|---|---|
| Create equipment (registry, Arshin) | `hasOperatorAccess` | route dep `CurrentUser`, but `_assert_create_equipment_access` answers `403` | consistent |
| Edit / delete / batch-delete equipment | `canManage` | `OperatorUser` | consistent |
| Repairs and verifications: create, milestones, close | `canManage` | `OperatorUser` | consistent |
| Messages in repairs/verifications | author-only editing | `_assert_*_message_owner` / `_editor` (`403`) | consistent |
| Folders, groups, deadline presets | `hasAdminAccess` | `OperatorUser` / `AdminUser` | consistent |
| Tasks: create, edit, checklist, participants | offered to participants | `_assert_can_mutate` (`403`) | consistent |
| Private notes (equipment and tasks) | hidden for non-operators | `403` on create, hidden in lists | consistent |
| Share link, comments, attachments | shown to everyone | `CurrentUser` + folder scope | consistent |
| `/admin/users`, DEVELOPER assignment | `hasAdminAccess` / `isDeveloperRole` | `AdminUser` + role rules | consistent |

Result: no control was found that the interface hides while the backend allows it. The single
suspected case (equipment creation) is a route-level `CurrentUser` with a service-level
`403` - recorded here so the asymmetry is not "fixed" twice. Note: `PUT
/equipment/{id}/process-subscription` is not referenced by any UI code (unused API surface).




