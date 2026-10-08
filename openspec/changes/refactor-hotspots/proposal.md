# Proposal

## Why

Four frontend pages exceed 3.7k lines and `app/services/equipment_service.py` is 10,377
lines. That size makes the access-control and query fixes in `audit-and-fix` risky: a
change to one flow can silently break a neighboring one, and a reviewer cannot hold a
file in their head. The hotspots are restructured here, without changing behavior, before
the UI pilot touches the same pages.

## What Changes

- Extract `app/services/equipment_service.py` into domain services behind the existing
  public facade: folders and registry, repair and verification processes,
  comments and attachments, exports and imports, folder refresh.
- Extract the shared process core that `RepairsPage` and `VerificationPage` currently
  duplicate into common components and hooks.
- Split `EquipmentDetailsPage` and `EquipmentPage` into feature sections and hooks.
- Split `frontend/src/api/equipment.ts` by domain: folders, CRUD, processes,
  comments and attachments, refresh, export.
- No behavior change: no spec deltas (`skip_specs: true`). HTTP contracts, UI behavior and
  data shapes stay identical.

## Capabilities

### New Capabilities

None. This is a pure refactoring change with no spec-level behavior change, so it sets
`skip_specs: true` in `.openspec.yaml`.

### Modified Capabilities

- None.

## Impact

- Backend: `app/services/equipment_service.py` (split), `app/api/v1/routes/equipment.py`
  (import paths only), callers in `app/services/task_service.py` and `app/tasks/*`.
- Frontend: `src/pages/EquipmentDetailsPage.tsx`, `src/pages/EquipmentPage.tsx`,
  `src/pages/RepairsPage.tsx`, `src/pages/VerificationPage.tsx`, `src/api/equipment.ts`
  and the components they use.
- No schema, HTTP contract or dependency changes.
