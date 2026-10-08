# Proposal

## Why

The first UI-migration feedback round shipped (Tailwind v4, the `metro-ui` pilot, authentic
shadcn light/dark themes, searchable pickers, editable task priority, search history). Three
requested items are still open because each needs either a dependency choice or a schema change,
and they were deliberately not started without a decision:

- dragging a task card on the board only moves the browser's ghost, and it does not snap to the
  target column;
- the folder list in Equipment cannot be reordered, and the requested order is **per user**
  (default alphabetical, and reordering must not affect anybody else);
- checkboxes are still used for boolean settings, where the shadcn `switch` reads better.

## What Changes

- The task board SHALL drag the card itself (not a placeholder) with a smooth animation, and the
  card SHALL settle into the target column on drop. Keyboard operation SHALL keep working.
- The Equipment folder list SHALL be reorderable by drag and drop, with the order stored **per
  user**; the default order is alphabetical, and one user's order must not change another's.
- Boolean settings and filters SHALL use the shadcn `switch` instead of a checkbox. List
  selection (including table row selection in the registry) SHALL stay on checkboxes, where a
  switch would be the wrong control.
- The deferred `dropdown-menu` adoption stays out of scope: the only hand-rolled dropdown
  (`EmojiPickerButton`) is shared by 19 call sites across five pages, which is a fleet-wide
  decision rather than a pilot step.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the drag-and-drop and control-appearance expectations.

## Impact

- Frontend: the task board (`TasksPage.tsx`), the folder list (`EquipmentPage.tsx` /
  `useFolderActions`), the settings/filter surfaces, plus a new drag library.
- Backend: a per-user folder order (a JSON column on `users`, an API to store it, and ordering in
  the folder list endpoint) - requires an Alembic migration.
- Dependencies: `@dnd-kit/*` (pending approval) and a vendored `switch` component.
