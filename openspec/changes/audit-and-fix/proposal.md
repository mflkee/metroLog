# Proposal

## Why

metroLog grew fast: the backend is ~9.6k statements at 82% test coverage with a
10.4k-line service module, and the frontend has four pages above 3.7k lines. Mypy is
configured but never runs, and frontend coverage does not exist, so defects in access
control, query shape and client state are found by users on Stage instead of by the
pipeline. Before refactoring and UI work, there must be a verified baseline and a
closed list of real defects.

## What Changes

- Establish a measurable baseline: run mypy and record its findings, add coverage
  reporting for backend and frontend, and record the confirmed bug inventory.
- Audit and fix access-control defects: every write endpoint enforced by role (folder
  scoping with soft denial, operator-only operations) and no UI action offered that the
  backend rejects.
- Audit and fix backend correctness and performance defects in the repair and
  verification queue paths (unbounded queries, N+1 access, missing indexes) and in
  background folder-refresh tasks.
- Audit and fix frontend state defects: react-query keys and stale data, missing
  `enabled` gates, signed-in state handling for `401`/`403`, autosave loss and modal
  state reset.
- Record every discovered behavior change as a spec delta in `access-control` before it
  is implemented.

## Capabilities

### New Capabilities

- `access-control`: the normative rules for who may read or write folder-scoped data,
  including soft denial and operator-only operations.

### Modified Capabilities

- None.

## Impact

- Backend: `app/api/v1/routes/*`, `app/services/*` (authorization assertions and query
  shapes), `app/repositories/equipment_repository.py`, `app/tasks/*`.
- Frontend: `src/api/client.ts`, `src/api/equipment.ts`, `src/api/tasks.ts`, role gating
  in `src/pages/*` and `src/components/*`.
- Tooling: pytest coverage reporting, first mypy run, mutation-check configuration.
- Data: no schema change expected; a migration is added only if the audit finds a missing
  index.
