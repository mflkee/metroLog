# Tasks

## 1. Backend extraction behind the facade

- [ ] 1.1 Extract folders and registry code from `app/services/equipment_service.py` into a domain service and delegate from the existing methods; verify `npm run test:backend` passes and the original file is smaller.
- [ ] 1.2 Extract the repair and verification process code (shared process core included) into a domain service and delegate; verify the process tests pass and no public signature changed.
- [ ] 1.3 Extract comments and attachments code into a domain service and delegate; verify the comment and attachment tests pass.
- [ ] 1.4 Extract exports/imports and folder refresh into domain services and delegate; verify the refresh and export tests pass.
- [ ] 1.5 Update `AGENTS.md` so the repo map names the new modules and verify the paths listed exist.

## 2. Backend cleanup

- [ ] 2.1 Remove dead imports and leftover private helpers after the extraction; verify `npm run lint:backend` and `npm run test:backend` pass.
- [ ] 2.2 Confirm no file created by this change exceeds ~2.5k lines and record the final line counts for each module.

## 3. Frontend shared process core

- [ ] 3.1 Extract the repair/verification common components and hooks used by both pages and verify `npm run build:frontend` passes.
- [ ] 3.2 Switch `RepairsPage.tsx` and `VerificationPage.tsx` to the shared core and verify both pages still work on Stage (queue, batch, milestones, messages).

## 4. Frontend page splits

- [ ] 4.1 Split `EquipmentDetailsPage.tsx` into feature sections and hooks and verify the page builds and renders on Stage (SI, ESI and OTHER cards, comments, attachments).
- [ ] 4.2 Split `EquipmentPage.tsx` into feature sections and hooks and verify the registry works on Stage (filters, bulk actions, modals, pagination).

## 5. Frontend API client split

- [ ] 5.1 Split `frontend/src/api/equipment.ts` by domain (folders, CRUD, processes, comments/attachments, refresh, export) and verify `tsc` and `npm run build:frontend` pass with no import errors.
- [ ] 5.2 Re-export the public API from a single entry point if callers relied on one module and verify no call site was changed beyond imports.

## 6. Integration verification on Stage

- [ ] 6.1 Push to `main`, confirm the CI run and the Stage deploy succeed, then walk the equipment card, registry, repairs and verifications on Stage and confirm behavior is unchanged.
- [ ] 6.2 Run `npm run check` and record the result as the refactoring acceptance evidence.
