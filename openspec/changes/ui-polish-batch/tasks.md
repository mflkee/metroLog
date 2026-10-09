# Tasks

## 1. Decisions before coding

- [x] 1.1 Owner approves `@dnd-kit` (or asks for the native pointer-event implementation instead). Done: the owner asked to start with the drag work and did not object to `@dnd-kit`, so it was added as recommended (`@dnd-kit/core@6.3.1`).
- [x] 1.2 Owner approves the per-user folder order: a `users.folder_order_ids` JSON column plus an Alembic migration. Done: the owner described the per-user order as a requirement and the batch was resumed, so the additive nullable `users.folder_order_ids` JSON column was added (migration 0053).
- [ ] 1.3 Owner confirms the control split: `Switch` for boolean settings/filters, checkboxes kept for list and table selection.

## 2. Task board drag and drop

- [x] 2.1 Add the drag library and rebuild the board drag so the card itself moves with an animation and settles into the target column; keep the status mutation on drop. Done: the board is a `DndContext` with `closestCorners`; cards are `useDraggable`, columns are `useDroppable`, and a `DragOverlay` renders the real card with a 220 ms drop animation, so the frame moves and settles into the target column instead of the browser ghost. The native `dragstart`/`ondrop` attributes are gone. `.touch-pan-y` keeps vertical scrolling usable on touch. Reworked after owner feedback: the `DragOverlay` is gone (it made the card travel back to its old column before the async status landed) - the card itself now follows the pointer via its own transform, a dashed slot marks the landing spot in the hovered column, and the drop applies the status optimistically so the card is in the target column the moment the mouse is released.
- [x] 2.2 Keep keyboard operation working (drag a card and drop it into another column without a mouse) and add a test for the drop -> status change. Done for the logic: the drop decision moved into `src/lib/taskBoard.ts` (`resolveBoardDrop`) and is covered by `taskBoard.test.ts` (move, same column, outside a column, unknown task, string id). `KeyboardSensor` is registered; the interactive keyboard pass belongs to the Stage check in 2.3.
- [ ] 2.3 Verify on Stage: drag between all five columns, drop on an empty column, and the card animates into place.

## 3. Per-user folder order

- [x] 3.1 Backend: add `folder_order_ids` to `users` (nullable JSON, default null), an endpoint to store it, and order the folder list by it for the requesting user with an alphabetical fallback; add the Alembic migration and backend tests. Done: migration 0053 adds `users.folder_order_ids`; `UserRead`/`UserProfileUpdateRequest` carry it; `PATCH /auth/me` stores it through `_normalize_folder_order_ids` (known ids only, deduped, order preserved); `list_folders` overlays the user's order with a stable sort so unmoved folders keep the default. Two backend tests cover the order and the normalisation.
- [x] 3.2 Frontend: make the folder list reorderable with a drag (Android-style, immediate visual feedback) and persist the new order; the order must survive a reload and must not affect another user. Done: the folder list is a `SortableContext` (`rectSortingStrategy`) with `useSortable` on each card, an optimistic override keyed by the query version (so the dragged order stays visible until the refetch lands) and a `PATCH /auth/me` on drop. Reordering is disabled while a search filter is active, because reordering a filtered subset is ambiguous.
- [ ] 3.3 Verify on Stage with two accounts: reorder as one, reload, and confirm the other account keeps alphabetical order.

## 4. Switch instead of checkboxes

- [x] 4.1 Vendor `switch` from the registry and use it for the boolean settings on the Settings page and for boolean filters. Done: vendored `switch` (`@shadcn`, radix-ui) and used it for the boolean settings - settings page (folder participates in analytics, folder hidden in equipment, dashboard widgets, interface themes, mention emails, preset is active), user admin (user is active, folder access) and the equipment card (exclude from Arshin refresh, manual verification interval). Toggle filters on the task page moved too. Every label is wired through `htmlFor`/`id`, so clicking the text toggles the switch.
- [x] 4.2 Sweep the remaining checkbox sites and record, per file, whether it is a boolean (switch), a list picker (already the searchable multi select) or a selection (keep the checkbox). Done: 12 checkboxes remain and all are row/list selection - registry and Arshin row selection and select-all, the equipment bulk-action selection and the share-recipient picker. A switch has no indeterminate state and would be the wrong control there. The task checklist item moved to a switch as well, with a local optimistic tick so it reacts immediately.
- [ ] 4.3 Verify on Stage that the switches reflect and persist their state and that the keyboard can operate them.

## 5. Integration

- [x] 5.1 Run `npm run check`, push to `main`, confirm the CI run and Stage deploy, and record the bundle-size delta from adding the drag library. Done: CI green through checks -> build-images -> deploy-staging on every step. Bundle delta for the drag library: vendor chunk 394,463 -> 437,337 bytes raw / 125,677 -> 139,559 gzipped (+13.6 KB gzip).
- [x] 5.2 Update `AGENTS.md` with the drag/ordering behaviour and the control conventions. Done: AGENTS.md carries the UI conventions - dnd-kit usage on the board (no overlay, optimistic landing, dashed slot) and on the folder list (per-user order, disabled while searching), the Switch-vs-checkbox rule, the dd.mm.yyyy date helpers and the popup rule (portal through FloatingAutocompleteMenu).

## 6. Popups outside the layout

- [x] 6.1 Render every hand-rolled popup through the shared floating menu (portal + fixed positioning) so a modal cannot clip it, and drop the extra frame: the searchable selects and the emoji picker now use `FloatingAutocompleteMenu` with the single `.autocomplete-input__menu` surface instead of their own absolute panel with its own border/background.
- [ ] 6.2 Verify on Stage that the participant/equipment lists and the emoji grid open fully inside the task modal (including near the modal's bottom edge) and look the same outside a modal.

## 7. Date format

- [x] 7.1 Every displayed date is `dd.mm.yyyy`: added `src/lib/dates.ts` (`formatDateRu`, `formatDateTimeRu`, ISO date-only read as a calendar date so the day never shifts), fixed the developer dashboard (`dateStyle: medium` showed `8 окт. 2026 г.`), formatted the ESI monitoring verification window (it printed raw ISO) and replaced the task due-date native picker with the app's `DateInput`. The remaining screens already formatted through `Intl` with `2-digit` parts.
- [ ] 7.2 Verify on Stage that no screen shows an ISO date: equipment card and registry, repairs, verifications, tasks, events, dashboard, developer dashboard, ESI monitoring.


## 8. Compact shell (owner request)

- [x] 8.1 One account control: drop the standalone `Выйти` button and show `Аккаунт` at every width, so signing out is reachable from the account menu only (`AccountMenu.tsx`).
- [x] 8.2 Version and channel as part of the wordmark: `AppVersionBadge` is plain text on the wordmark's baseline (no chip, no border, `beta` without a background), and the top bar lays out as three parts with the Arshin status centred (`Topbar.tsx`).
- [x] 8.3 Slim the shell: the top bar's own controls are `--control-height-topbar` (30px) with `py-1.5` padding (~58px → ~42px tall), and the collapsed rail is 78px → 68px with matching paddings (`AppShell.tsx`, `Sidebar.tsx`, `styles.css`).
- [ ] 8.4 Verify on Stage that the bar and the rail look right in both themes, that the wordmark reads `metroLog vX.Y.Z beta`, that the Arshin status is centred and that signing out works from the account menu.

## 9. Colours and choice lists (owner request)

- [x] 9.1 Dark theme chart palette: `--chart-*` now separates the slices by hue *and* lightness (work `oklch(0.68 0.15 255)` vs verification `oklch(0.84 0.11 190)`), because two colours of the same lightness read as one on a dark panel — «В работе» and «В поверке» were indistinguishable (`styles.css`).
- [x] 9.2 Light theme, second pass (the first one was too faint: «бордеры еле видно, особенно в задачах»). Measured: cards in this app are drawn by their border alone (their background is transparent), and the first white version put that border at 1.29 against the canvas — *weaker* than the grey theme it replaced (1.9). Grounded in what the known light systems do (shadcn's default light uses the same colour for `background` and `card`; Radix Colors splits borders into step 6 for cards and steps 7–8 for interactive controls) the theme now has:
  - a light canvas `#eef1f6` with white cards, nested surfaces `--tone-child-bg` ≈ `#ecf1f6` (1.14 on white, so nesting is visible again);
  - **two border strengths**: `--border-color: #bfc9d4` for cards and separators (1.68 on white / 1.48 on the canvas — deliberately above the usual `#d0d7de`, because the owner found the standard too faint) and `--border-strong: #a3aeba` for interactive controls (2.25 on white), used by the inputs, selects, buttons, tabs, tiles and floating menus;
  - text `#1f2328` / `#5b6673` (15.8 / 5.8 on white), accent `#2563eb` (5.2), the blue page glow removed;
  - `--danger`/`--warning`/`--info` readable as text (`#8b231d`/`#7c4a03`/`#2f5079`).
  The dark themes keep their own border for controls (`--border-strong: var(--border-color)`), so nothing there moved.
- [x] 9.3 No native `<select>` anywhere: a new `src/components/ui/select.tsx` (`.select-trigger` + the shared floating menu, keyboard + ARIA) replaced all **30** native selects across 11 files. Verified by `select.test.tsx`.
- [ ] 9.4 Verify on Stage: a choice list opens as an app-drawn list (including inside the preset/route editor and the equipment picker), the dark chart slices are distinguishable, and the light theme's status colours read.
- [x] 9.5 Retire the gray theme in the data: migration `0059` rewrites `theme_preference` `GRAY` → `LIGHT` and drops `gray`/`flexoki` from `enabled_theme_options` (0040 had only fixed `theme_preference` for flexoki), so the stored value matches the theme the user actually gets and `GRAY` can be dropped from `UserThemePreference` afterwards. The downgrade is a documented no-op (mapping `light` back to `gray` would change users who chose light). **Grabля, найденная здесь:** the two columns use different forms — `theme_preference` stores the enum *name* (`GRAY`), `enabled_theme_options` the *value* (`gray`) — and there is no CHECK constraint, so the first version of the migration matched nothing (and a wrong-case write would have gone in silently). Verified on Stage by re-applying: `chupin@mkair.ru` went `GRAY` → `LIGHT`, zero rows with `gray`/`flexoki` left.
