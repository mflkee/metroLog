# Tasks

## 1. Decisions before coding

- [ ] 1.1 Owner approves `@dnd-kit` (or asks for the native pointer-event implementation instead).
- [ ] 1.2 Owner approves the per-user folder order: a `users.folder_order_ids` JSON column plus an Alembic migration.
- [ ] 1.3 Owner confirms the control split: `Switch` for boolean settings/filters, checkboxes kept for list and table selection.

## 2. Task board drag and drop

- [ ] 2.1 Add the drag library and rebuild the board drag so the card itself moves with an animation and settles into the target column; keep the status mutation on drop.
- [ ] 2.2 Keep keyboard operation working (drag a card and drop it into another column without a mouse) and add a test for the drop -> status change.
- [ ] 2.3 Verify on Stage: drag between all five columns, drop on an empty column, and the card animates into place.

## 3. Per-user folder order

- [ ] 3.1 Backend: add `folder_order_ids` to `users` (nullable JSON, default null), an endpoint to store it, and order the folder list by it for the requesting user with an alphabetical fallback; add the Alembic migration and backend tests.
- [ ] 3.2 Frontend: make the folder list reorderable with a drag (Android-style, immediate visual feedback) and persist the new order; the order must survive a reload and must not affect another user.
- [ ] 3.3 Verify on Stage with two accounts: reorder as one, reload, and confirm the other account keeps alphabetical order.

## 4. Switch instead of checkboxes

- [ ] 4.1 Vendor `switch` from the registry and use it for the boolean settings on the Settings page and for boolean filters.
- [ ] 4.2 Sweep the remaining checkbox sites and record, per file, whether it is a boolean (switch), a list picker (already the searchable multi select) or a selection (keep the checkbox).
- [ ] 4.3 Verify on Stage that the switches reflect and persist their state and that the keyboard can operate them.

## 5. Integration

- [ ] 5.1 Run `npm run check`, push to `main`, confirm the CI run and Stage deploy, and record the bundle-size delta from adding the drag library.
- [ ] 5.2 Update `AGENTS.md` with the drag/ordering behaviour and the control conventions.
