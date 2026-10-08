# Tasks

## 1. Backend extraction: process templates and deadline presets first

The order follows the measured module-level dependency closure (see design.md), not the
original guess: process stage templates and deadline presets are the subsystem that every
other group drags along, so they move out first.

- [x] 1.1 Move the process stage-template and deadline-preset module-level helpers out of `app/services/equipment_service.py` into `app/services/equipment_process_templates.py` and import them back; verify `npm run test:backend` passes and the original file shrinks by the moved block. Done: 62 blocks / 1161 lines moved, `equipment_service.py` 10389 -> 9264 lines, `equipment_process_templates.py` 1177 lines, backend suite 141 passed, mypy unchanged at 81 errors.
- [x] 1.2 Move the deadline-preset methods (`list/create/update/delete_deadline_preset`, `_get_deadline_preset`, `_resolve_deadline_preset_for_folder`, `_ensure_default_deadline_preset`) into an `EquipmentProcessTemplatesMixin` in the same module and inherit it from `EquipmentService`; verify the preset and process tests pass. Done: 7 methods / 265 lines moved, `EquipmentService` now inherits the mixin, three shared text helpers moved to `equipment_text.py` (closed dependency set), `equipment_service.py` 9264 -> 8883 lines, backend suite 141 passed, mypy back to the 81-error baseline via `TYPE_CHECKING` declarations.
- [x] 1.3 Extract the folder and group methods plus their helpers into an `EquipmentFoldersMixin` and inherit it; verify the folder, group and suggestion tests pass and check `AGENTS.md` still names the right modules. Done: 13 methods + 2 helpers (304 lines), `equipment_service.py` 8883 -> 8543 lines, `equipment_folders.py` 412 lines (with precise `TYPE_CHECKING` declarations), suite 141 passed, mypy at the 81-error baseline.

## 2. Backend extraction: folders, comments and processes

- [x] 2.1 Extract the comments and attachments methods into an `EquipmentCommentsMixin` and inherit it; verify the comment and attachment tests pass. Done: 20 methods + 32 helpers (887 lines) moved into `equipment_comments.py` (attachment storage, image pipeline, comment-upload staging, comments CRUD); `equipment_service.py` 8543 -> 7584 lines, suite 141 passed, mypy at the 81-error baseline. Reusable extraction tool added as `scripts/dev/extract_mixin.py`.
- [x] 2.2 Extract the repair and verification process methods (shared process core included) into an `EquipmentProcessesMixin` and inherit it; verify the process tests pass and no public signature changed. Done in two steps because the pair does not fit the ~2.5k budget: **2.2a repairs** - 41 methods + 17 helpers (1982 lines) into `equipment_repairs.py`; **2.2b verifications** - 40 methods + 25 helpers (2013 lines) into `equipment_verifications.py`. `equipment_service.py` 7584 -> 3396 lines; suite 141 passed; mypy at the 81-error baseline; the `UploadedFilePayload`/text-helper imports of routes and `task_service` were re-pointed to `equipment_comments`, and `test_process_stage_templates.py` now imports the template helpers from their real modules.
- [x] 2.3 Extract exports/imports and folder refresh into their own mixins and inherit them; verify the refresh and export tests pass. Done: `equipment_exports.py` (4 methods + 14 helpers, 374 lines: Excel import/export, certificate parsing) and `equipment_folder_refresh.py` (12 methods + 8 helpers, 593 lines); `_create_temp_export_file_path` moved into the exports module so repairs/verifications import it from there (no cycle); `equipment_service.py` 3396 -> 2350 lines, suite 141 passed, mypy at the 81-error baseline.
- [ ] 2.4 Remove dead imports and leftover private helpers after the extraction, update `AGENTS.md` so the repo map names the new modules, and verify `npm run lint:backend` and `npm run test:backend` pass.
- [ ] 2.5 Confirm no file created by this change exceeds ~2.5k lines and record the final line counts for each module.

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
