# Tasks

## 1. Baseline and tooling

- [ ] 1.1 Run `npm run check` and record the current results (backend lint and tests, frontend lint, tests, build); verify the command exits 0 and store the output as the baseline.
- [ ] 1.2 Add coverage reporting to the backend test command and record the baseline total (currently 82%); verify `npm run test:backend` produces the report.
- [ ] 1.3 Run mypy over `backend/app` and record the number of findings as the baseline; verify the command completes and the count is recorded.
- [ ] 1.4 Add frontend coverage reporting to the vitest configuration and record the baseline; verify `npm run test:frontend -- --coverage` writes a report.

## 2. Backend access-control audit and fixes

- [ ] 2.1 Build the route x authorization matrix for every endpoint in `backend/app/api/v1/routes/` and record each gap as a finding with severity; verify the matrix covers every route function.
- [ ] 2.2 For every write endpoint offered by the UI without a role check, add or fix the check and verify with a test asserting `403` for the denied role.
- [ ] 2.3 Verify folder-scoped reads and writes return `404` for denied folders by adding a test for each endpoint that lacks one.
- [ ] 2.4 Confirm private notes remain operator-only end to end (`403` on create, absent from list responses for non-operators) and extend `backend/tests/test_tasks.py` where a path is uncovered.

## 3. Backend correctness and performance

- [ ] 3.1 Review the repair and verification queue queries for unbounded result sets and N+1 access, record findings, and fix by adding bounds and eager loading; verify with a query-count or limit test.
- [ ] 3.2 Review background folder-refresh execution (session lifecycle, status transitions, idempotency) and fix defects; verify with a test that reruns the task and observes no duplicated rows.
- [ ] 3.3 Review attachment and export/import handling for size, type and path validation, fix gaps, and verify with tests for rejected oversize and unsupported uploads.
- [ ] 3.4 Check indexes for the columns used by the audited queries and add missing migrations; verify `alembic upgrade head` applies cleanly on Stage.

## 4. Frontend authorization and role gating

- [ ] 4.1 Build the page x action matrix and audit every role-conditional control; record and fix any action offered but rejected by the backend.
- [ ] 4.2 Audit `src/api/client.ts` for `401`/`403` handling (expired token, denial feedback) and fix; verify with tests covering both error paths.

## 5. Frontend data and state correctness

- [ ] 5.1 Audit react-query keys, `enabled` gates and invalidation for stale or mismatched data; fix and verify with a test or a documented Stage scenario.
- [ ] 5.2 Audit `useQueuedAutoSave` and modal state reset for data loss on close or reload; verify the loss is reproduced before the fix and gone after it.

## 6. Integration verification on Stage

- [ ] 6.1 Push to `main`, confirm the CI run and the Stage deploy succeed, then walk the audited flows on Stage (registry, equipment card, repairs, verifications, tasks, journal) as an `MKAIR` and as a `CUSTOMER`.
- [ ] 6.2 Run the backend test suite and record the result, confirming no scenario in `openspec/specs/access-control` regressed.
