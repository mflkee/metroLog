# Proposal

## Why

Two destructive actions still fall back to the browser's own dialog: deleting a task
(`TaskDetailsPage.tsx`) and deleting a deadline preset (`SettingsPage.tsx`) both call
`window.confirm`. A browser dialog cannot carry the app's theme, its wording or a pending state,
and on some platforms the OS draws it. Every other destructive action already confirms in the
shared modal (equipment, folders, users, archives, comments, attachments), so these two were the
only places where the confirmation looked foreign.

The confirmation rule was also uneven in the other direction: deleting a comment or an attachment
on the equipment card asked, while deleting a discussion message (repairs, verifications, a task)
or a task attachment happened on the first click.

## What Changes

- Deleting a task SHALL confirm in the app's own modal, like every other deletion.
- Deleting a deadline preset SHALL confirm in the app's own modal, and a refusal from the API
  (a system preset, or a preset a folder has selected) SHALL be reported inside that modal.
- Content that disappears for good SHALL ask before it goes: discussion messages (repairs,
  verifications, a task) and task attachments join the comment, attachment, archive, equipment,
  folder and user deletions that already ask.
- Something edited in a form SHALL NOT ask: a checklist item, a process stage row, a file that has
  not been uploaded yet, and a preset variant or stage are drafts, not deletions.
- The app SHALL NOT use the browser's `confirm`, `alert` or `prompt`. A source guard SHALL fail
  the test run when one is introduced again.
- The single `beforeunload` listener stays, recorded as the deliberate exception: warning about an
  unsaved edit on reload or tab close is only possible through the browser, and it is already
  gated on a genuine unsaved change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the requirement that a confirmation is drawn by the app itself.

## Impact

- Frontend only: `TaskDetailsPage.tsx`, `SettingsPage.tsx`, `RepairsPage.tsx`,
  `VerificationPage.tsx`, `EquipmentDetailsPage.tsx`, `useProcessMessages.ts`, the shared
  `DeleteConfirmModal`, and a new guard in `src/lib/uiConventions.test.ts`. No API, schema or data
  change.
