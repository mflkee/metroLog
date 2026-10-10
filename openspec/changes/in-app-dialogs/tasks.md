# Tasks

## 1. The browser's dialogs out of the app

- [x] 1.1 Task deletion (`TaskDetailsPage.tsx`): open the shared `DeleteConfirmModal` from the Delete button instead of calling `window.confirm`; keep the pending state, report a failure inside the dialog (the page's error line sits behind it), and let the dialog close only on success (the page then navigates to the task list). Done: the button sets `deleteConfirmOpen`; the mutation's `onError` was dropped in favour of `errorMessage` on the dialog, which stays open and cannot be dismissed while the delete is pending.
- [x] 1.2 Deadline-preset deletion (`SettingsPage.tsx`): open the shared `DeleteConfirmModal` from the preset's Delete button instead of calling `window.confirm`; keep the pending state and report a failure inside the dialog - including the API's refusal when the preset is a system preset or a folder still selects it. Done: `handleDeletePreset` only opens the dialog (`presetToDelete`), `confirmDeletePreset` runs the mutation, and the dialog carries the refusal text; the dialog's description also warns that a folder-selected preset must be re-pointed first.
- [x] 1.3 Add a guard to `src/lib/uiConventions.test.ts` that fails when any non-test source calls `window.confirm`, `window.alert` or `window.prompt`, with the `beforeunload` exception recorded next to it. Done: the guard reads every non-test source; a temporary probe file with `window.confirm` made it fail with `["./__guard_probe.ts"]` and the probe was removed.
- [x] 1.4 Record the rule in `AGENTS.md` (UI conventions): dialogs are drawn by the app; the only browser dialog allowed is `beforeunload`, and only for an unsaved edit.

## 2. Checks

- [x] 2.1 `npm run check` is green, the new guard included, and the guard fails on a deliberate `window.confirm` (checked locally, then reverted). Done: ruff clean, backend 153 passed, eslint 0 errors, frontend 139 passed (26 files), build ok.
- [ ] 2.2 On Stage, deleting a task and deleting a deadline preset both confirm in the app's modal: cancel leaves the item in place, confirm removes it, and the browser's own dialog never appears.
- [ ] 2.3 On Stage, deleting a preset that a folder selects shows the API's refusal inside the modal and leaves the preset in the list.
