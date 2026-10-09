# Tasks

## 1. Backend: store the arrangement

- [x] 1.1 Add a nullable `dashboard_layout` JSON column to `users` and an Alembic migration `0057` that adds it; verify `alembic upgrade head` then `alembic downgrade -1` runs cleanly against the local database.
- [x] 1.2 Add the field to the user read and profile-update schemas and to `PATCH /auth/me`, normalizing it server-side (known widget keys only, size clamped to `third|half|full`, collapsed coerced to a boolean, entries deduped, order preserved, `null` stored as-is); verify with backend tests that a valid arrangement round-trips, that an unknown key and a bad size are dropped or clamped, and that the existing `dashboard_widget_options` behaviour is unchanged.
- [x] 1.3 Cover the endpoint in `backend/tests` so a stored arrangement is returned by `GET /auth/me` and a rejected value never raises; verify `npm run test:backend` passes.

## 2. Frontend: arrangement model

- [x] 2.1 Add the layout types and the default arrangement to `src/lib/dashboard.ts`, reproducing today's order and widths exactly (`summary_cards` full, `my_tasks` full, `status_distribution` third, `type_distribution` third, `top_locations` half, `verification_expiry` half, `completed_processes` half, `average_durations` half, `recent_events` full), plus the size-to-`col-span` mapping; verify with a unit test that the default arrangement matches the previous order and widths.
- [x] 2.2 Add the normalization and merge helpers (drop unknown keys, clamp the size, dedupe, append missing widgets in default order, fall back to the default on an unreadable value, keep entries for widgets that are merely not visible right now) and the profile-payload mapping; verify with unit tests covering each of those cases.

## 3. Frontend: render by arrangement

- [x] 3.1 Render `DashboardPage` from the normalized arrangement: position, `col-span` from the size preset, and the body hidden when collapsed, while keeping every widget's current content and links unchanged; verify with a component test that the order and the spans follow the arrangement and that the default arrangement renders the same as before.
- [x] 3.2 Keep the arrangement stable when a widget is filtered out by role or visibility (the entry is kept, not appended) and make the composite summary adapt its inner columns to its own width; verify with a test that a hidden-then-shown widget returns to its saved place.

## 4. Frontend: edit mode

- [x] 4.1 Add the dashboard edit mode: a toggle in the header that reveals drag handles, the size control, the collapse control and a reset, with the content non-interactive while editing and normal again on exit; verify with a component test that the controls appear and disappear with the mode.
- [x] 4.2 Make widgets reorderable in edit mode with `@dnd-kit` (`DndContext` + `SortableContext` + `useSortable`, `KeyboardSensor` registered) and persist the new order through `PATCH /auth/me`, with an optimistic order that survives the refetch and an error message that restores the previous arrangement when the save fails; verify with a test of the reorder logic (the manual keyboard drag is part of the Stage check in 9.2).
- [x] 4.3 Wire the size presets, the collapse toggle and the reset action to the same save path, each keeping the rest of the arrangement intact; verify with tests that changing a size, collapsing and resetting each produce the expected stored arrangement.
- [x] 4.4 Document the feature in `AGENTS.md` (dashboard arrangement, edit mode, the stored column, the default arrangement rule) and in the user guide (`src/content/user-guide.ru.txt`, the dashboard section); verify the wording matches the shipped behaviour and that `npm run build:frontend` still bundles the guide.

## 5. Frontend: narrow screens and Settings interplay

- [x] 5.1 Make the wide-screen-only rules explicit: below the wide breakpoint the widgets stack full width in the chosen order and edit mode offers no dragging; verify with a test that the stacked order follows the arrangement and that drag is not enabled on a narrow viewport.
- [x] 5.2 Keep the Settings visibility switches as the only place that shows or hides widgets, and make a hidden widget keep its arrangement; verify with a test that switching a widget off and on again restores its saved position, size and collapsed state, and that the Settings wording still describes visibility only.

## 7. Owner feedback round

- [x] 7.1 A dragged item must keep its own size: use `CSS.Translate` instead of `CSS.Transform` in the dashboard widget cell and in the folder card; verify with a test that the drag style carries no scale (the visual pass is part of the Stage check in 9.2/9.3).
- [x] 7.2 Give the default arrangement a clean tiling (the two distribution modules become halves, so no row is left with an empty third) in the frontend catalogue and the backend default map; verify with a test that the default spans fill whole rows and that the clamp still lands on the new defaults.
- [x] 7.3 Reset the owner's Stage arrangement (`makeevgb@mkair.ru`) to the default so the new default is what the next check shows; verify `users.dashboard_layout` is `null` for that account on Stage.

## 8. Drag rework (second owner feedback)

- [x] 8.1 Stop the dragged item from resizing: drop `rectSortingStrategy` altogether (it fits an item into the slot it is heading to, so mixed sizes stretched or undershot) and reorder for real instead. Done: `src/lib/sortableOrder.ts` resolves the slot from the pointer, `src/lib/useDragReorder.ts` changes the rendered order live and saves once on drop, `src/lib/useFlipAnimation.ts` glides the neighbours; the dragged copy is a `DragOverlay` and its cell is a dashed placeholder. Verified by `sortableOrder.test.ts`.
- [x] 8.2 Apply the same engine to the folder list, whose cards have different widths and heights. Done: `FolderCard` is a `useDraggable` card with a placeholder of the measured size, the list reorders live, `Alt`+arrows move a card from the keyboard.
- [x] 8.3 A drop must not also open the item: dnd-kit leaves the browser's click after a drag, so a task dropped in its own place opened. Done: `onClickCapture` in `DraggableTaskCard` (tasks) and `shouldSuppressClick` on the folder card.
- [x] 8.4 Document the mechanics and the traps in `AGENTS.md` (no sorting strategy for mixed sizes, the live reorder + FLIP + placeholder pattern, the click after a drop) and the folder drag in the user guide.

## 9. Integration

- [x] 9.1 Run `npm run check` (ruff, pytest, eslint, vitest, frontend build) and confirm it is green.
- [x] 9.2 Push to `main`, confirm the CI run and the Stage deploy succeed, and verify the deployed bundle carries the new drag engine (no sorting strategy, the live reorder helper).
- [x] 9.3 Owner check on Stage with two accounts: rearrange, resize, collapse and reset as one account, reload, and confirm the other account still sees the default arrangement (and that a dragged module keeps its own width). Done: the owner approved the Stage pass on 09.10.2026.
- [x] 9.4 Owner check on Stage: nothing moved for a user who never edited the dashboard, and a narrow viewport stacks the widgets in the chosen order without offering dragging. Done: approved together with 9.3 (the default tiling itself was changed later at the owner's request).
