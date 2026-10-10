# Tasks

## 1. The browser's dialogs out of the app

- [x] 1.1 Task deletion (`TaskDetailsPage.tsx`): open the shared `DeleteConfirmModal` from the Delete button instead of calling `window.confirm`; keep the pending state, report a failure inside the dialog (the page's error line sits behind it), and let the dialog close only on success (the page then navigates to the task list). Done: the button sets `deleteConfirmOpen`; the mutation's `onError` was dropped in favour of `errorMessage` on the dialog, which stays open and cannot be dismissed while the delete is pending.
- [x] 1.2 Deadline-preset deletion (`SettingsPage.tsx`): open the shared `DeleteConfirmModal` from the preset's Delete button instead of calling `window.confirm`; keep the pending state and report a failure inside the dialog - including the API's refusal when the preset is a system preset or a folder still selects it. Done: `handleDeletePreset` only opens the dialog (`presetToDelete`), `confirmDeletePreset` runs the mutation, and the dialog carries the refusal text; the dialog's description also warns that a folder-selected preset must be re-pointed first.
- [x] 1.3 Add a guard to `src/lib/uiConventions.test.ts` that fails when any non-test source calls `window.confirm`, `window.alert` or `window.prompt`, with the `beforeunload` exception recorded next to it. Done: the guard reads every non-test source; a temporary probe file with `window.confirm` made it fail with `["./__guard_probe.ts"]` and the probe was removed.
- [x] 1.4 Record the rule in `AGENTS.md` (UI conventions): dialogs are drawn by the app; the only browser dialog allowed is `beforeunload`, and only for an unsaved edit.

## 2. Content deletion asks too

- [x] 2.1 Repair messages in the queue row (`RepairsPage.tsx`, both the author's and the manager's button): ask before the delete, close the dialog on success and show the failure inside it (`errorMessage={actionError}`, cleared when the dialog opens so a stale error cannot appear).
- [x] 2.2 Repair messages in the group card (`RepairsPage.tsx`): the same, with the group's own delete mutation.
- [x] 2.3 Verification messages in the group card and in the queue row (`VerificationPage.tsx`): the same, for both mutations.
- [x] 2.4 Repair and verification messages on the equipment card (`EquipmentDetailsPage.tsx`): the state lives in `useProcessMessages` next to the other message state, the mutations close the dialog on success, and each dialog carries its own section's error (`repairActionError` / `verificationActionError`).
- [x] 2.5 Task messages and task attachments (`TaskDetailsPage.tsx`): ask before the delete, name the file for an attachment, and report the failure inside the dialog.
- [x] 2.6 Leave the draft cases without a dialog and say so in the conventions note: a checklist item, a process stage row, a file that has not been uploaded yet, and a preset variant or stage.

## 3. Checks

- [x] 3.1 `npm run check` is green, the new guard included, and the guard fails on a deliberate `window.confirm` (checked locally, then reverted). Done: ruff clean, backend 153 passed, eslint 0 errors, frontend 147 passed (27 files), build ok.
- [x] 3.2 On Stage, deleting a task, a deadline preset, a discussion message (repair, verification, task) and a task attachment each confirm in the app's modal: cancel leaves the item in place, confirm removes it, and the browser's own dialog never appears. Verified on Stage by the owner and released as 0.6.0.
- [x] 3.3 On Stage, deleting a preset that a folder selects shows the API's refusal inside the modal and leaves the preset in the list. Verified on Stage by the owner and released as 0.6.0.
- [x] 3.4 On Stage, a checklist item and a process stage row still delete without a question (they are form drafts), so the rule reads as intended. Verified on Stage by the owner and released as 0.6.0.
