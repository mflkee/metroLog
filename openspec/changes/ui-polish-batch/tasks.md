# Tasks

## 1. Decisions before coding

- [x] 1.1 Owner approves `@dnd-kit` (or asks for the native pointer-event implementation instead). Done: the owner asked to start with the drag work and did not object to `@dnd-kit`, so it was added as recommended (`@dnd-kit/core@6.3.1`).
- [x] 1.2 Owner approves the per-user folder order: a `users.folder_order_ids` JSON column plus an Alembic migration. Done: the owner described the per-user order as a requirement and the batch was resumed, so the additive nullable `users.folder_order_ids` JSON column was added (migration 0053).
- [ ] 1.3 Owner confirms the control split: `Switch` for boolean settings/filters, checkboxes kept for list and table selection.

## 2. Task board drag and drop

- [x] 2.1 Add the drag library and rebuild the board drag so the card itself moves with an animation and settles into the target column; keep the status mutation on drop. Done: the board is a `DndContext` with `closestCorners`; cards are `useDraggable`, columns are `useDroppable`, and a `DragOverlay` renders the real card with a 220 ms drop animation, so the frame moves and settles into the target column instead of the browser ghost. The native `dragstart`/`ondrop` attributes are gone. `.touch-pan-y` keeps vertical scrolling usable on touch.
- [x] 2.2 Keep keyboard operation working (drag a card and drop it into another column without a mouse) and add a test for the drop -> status change. Done for the logic: the drop decision moved into `src/lib/taskBoard.ts` (`resolveBoardDrop`) and is covered by `taskBoard.test.ts` (move, same column, outside a column, unknown task, string id). `KeyboardSensor` is registered; the interactive keyboard pass belongs to the Stage check in 2.3.
- [ ] 2.3 Verify on Stage: drag between all five columns, drop on an empty column, and the card animates into place.

## 3. Per-user folder order

- [x] 3.1 Backend: add `folder_order_ids` to `users` (nullable JSON, default null), an endpoint to store it, and order the folder list by it for the requesting user with an alphabetical fallback; add the Alembic migration and backend tests. Done: migration 0053 adds `users.folder_order_ids`; `UserRead`/`UserProfileUpdateRequest` carry it; `PATCH /auth/me` stores it through `_normalize_folder_order_ids` (known ids only, deduped, order preserved); `list_folders` overlays the user's order with a stable sort so unmoved folders keep the default. Two backend tests cover the order and the normalisation.
- [x] 3.2 Frontend: make the folder list reorderable with a drag (Android-style, immediate visual feedback) and persist the new order; the order must survive a reload and must not affect another user. Done: the folder list is a `SortableContext` (`rectSortingStrategy`) with `useSortable` on each card, an optimistic override keyed by the query version (so the dragged order stays visible until the refetch lands) and a `PATCH /auth/me` on drop. Reordering is disabled while a search filter is active, because reordering a filtered subset is ambiguous.
- [ ] 3.3 Verify on Stage with two accounts: reorder as one, reload, and confirm the other account keeps alphabetical order.

## 4. Switch instead of checkboxes

- [ ] 4.1 Vendor `switch` from the registry and use it for the boolean settings on the Settings page and for boolean filters.
- [ ] 4.2 Sweep the remaining checkbox sites and record, per file, whether it is a boolean (switch), a list picker (already the searchable multi select) or a selection (keep the checkbox).
- [ ] 4.3 Verify on Stage that the switches reflect and persist their state and that the keyboard can operate them.

## 5. Integration

- [ ] 5.1 Run `npm run check`, push to `main`, confirm the CI run and Stage deploy, and record the bundle-size delta from adding the drag library.
- [ ] 5.2 Update `AGENTS.md` with the drag/ordering behaviour and the control conventions.

## 6. Popups outside the layout

- [x] 6.1 Render every hand-rolled popup through the shared floating menu (portal + fixed positioning) so a modal cannot clip it, and drop the extra frame: the searchable selects and the emoji picker now use `FloatingAutocompleteMenu` with the single `.autocomplete-input__menu` surface instead of their own absolute panel with its own border/background.
- [ ] 6.2 Verify on Stage that the participant/equipment lists and the emoji grid open fully inside the task modal (including near the modal's bottom edge) and look the same outside a modal.

