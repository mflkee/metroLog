# Design

## Context

See proposal.md - Why. Current state that shapes the approach:

- Backend: 9,653 statements, 82% coverage. `app/services/equipment_service.py` is
  10,377 lines and `app/api/v1/routes/equipment.py` is 1,752 lines. Ruff already enables
  flake8-bugbear (`B`). Mypy is configured in `pyproject.toml` but is not run by
  `scripts/check.sh` or by CI.
- Row-level access lives in services (`_assert_folder_access` in
  `equipment_service.py` and `task_service.py`) plus `has_operator_access` and
  `has_admin_access` in `user_service.py`. Background folder-refresh execution opens its
  own sessions through `SessionLocal` in `routes/equipment.py`.
- Frontend: 60 `.tsx` files, `strict` TypeScript, 2,780 className usages. Only 10 unit
  tests exist, all for `src/lib/*`; there is no coverage configuration.
- No TODO/FIXME markers exist in either codebase, so defects must be found structurally.
- Verification happens on Stage: `main` deploys to Stage through CI; there is no local run.

## Goals / Non-Goals

**Goals:**

- A closed, severity-ranked defect list, each item with a fix and a regression test.
- A repeatable baseline (mypy findings, coverage numbers) recorded for later comparison.
- Confidence that every mutation the UI offers is backed by a backend authorization check.

**Non-Goals:**

- Restructuring the large modules (owned by `refactor-hotspots`).
- Adopting a component library (owned by `shadcn-ui-pilot`).
- Load testing; the audit records query-shape risks only, not throughput numbers.

## Decisions

**Audit as a matrix, not free-form reading.** Build a route x authorization matrix
(folder scoping and role gate per endpoint) and a page x action matrix on the frontend.
Rationale: with no markers and thousands of class names to sift, an explicit matrix makes
gaps visible and reviewable, and it doubles as the evidence trail. Alternative: reading
the largest files top to bottom - rejected because coverage of the edges is unprovable.

**Every fix is verified by a test that fails first.** Access-control fixes get a backend
test asserting the `403` or `404`; query-shape fixes get a limit or query-count test;
frontend state fixes get a unit or component test where feasible. Rationale: a fix without
a failing-first test does not prevent the same defect from returning.

**Behavior changes require a spec delta before the fix.** If a defect's correct behavior
is not covered by `access-control`, the requirement is added to the delta first.
Implementation-only fixes (N+1 access, indexes, session cleanup) stay out of specs.

**Tooling becomes blocking only after the baseline is clean.** Mypy and coverage are
added to `check.sh` and reported first; they turn into blocking gates later. Rationale: a
blocking check over an unmeasured baseline fails every unrelated pull request.

## Risks / Trade-offs

- [The mypy baseline may be large] -> record the count, fix only files touched by the
  audit, and do not widen the type-checking scope in this change.
- [A fix may change behavior users rely on] -> each fix ships with a test and a Stage
  check; the release stays a patch unless a spec delta was added.
- [The audit surfaces more defects than planned] -> a severity policy keeps major items in
  this change and moves the rest to a follow-up change with its own proposal.
