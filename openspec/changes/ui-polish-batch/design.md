# Design

## Context

State when this change was written (all shipped to `main`, Stage green):

- Tailwind v4 is in place (`tailwind-v4-upgrade`); the bespoke tokens in `src/shared/styles.css`
  are still the single source of truth and the shadcn variable names are mapped onto them.
- The `shadcn-ui-pilot` landed the presentational trio, the dialog (with the dismissal contract
  and a test) and the first visible adoption on the task pages.
- The feedback round added: authentic shadcn light/dark palettes, a sticky full-height sidebar,
  a mobile-only navigation toggle, larger board status badges, `src/components/ui/searchable-select.tsx`
  (searchable single/multi select), `src/lib/searchHistory.ts`, edidable task priority and
  search-based equipment pickers.
- `TasksPage.tsx` drag and drop is native HTML5 (`draggable`, `dataTransfer`, `onDrop` per column
  header) - the browser draws the ghost, no animation, no snap.
- The folder list in `EquipmentPage.tsx` renders folders ordered by the backend (`sort_order`), the
  same for everybody.
- 26 checkbox inputs remain across nine files: boolean settings/filters, list pickers and table
  row selection.

## Goals / Non-Goals

**Goals:**

- A task board drag that moves the real card and settles it into the target column.
- A per-user folder order with an alphabetical default and no cross-user effect.
- The shadcn `switch` where a boolean is toggled.

**Non-Goals:**

- Replacing the bespoke `Modal` with the adopted dialog everywhere (the pilot kept it page-scoped).
- Turning table row selection into switches.
- Adopting `dropdown-menu` (fleet-wide decision, out of scope here).

## Decisions

**Use `@dnd-kit` for both drag interactions (pending owner approval).** It renders the dragged
element itself through transforms, animates the settle, supports sorting (`sortable`) and keeps
keyboard/screen-reader support. Building the same on native pointer events means reimplementing
collision detection and layout animations by hand, which is where such code usually breaks.
Alternative: keep native HTML5 drag and only restyle the ghost - rejected because the request is
explicitly "the frame moves and snaps".

**Store the folder order per user as a JSON list on `users` (pending owner approval).** The
existing `users` row already carries JSON lists (`allowed_folder_ids`, `dashboard_folder_ids`,
`hidden_equipment_folder_ids`), so `folder_order_ids` follows the established pattern and needs no
new table. The folders endpoint sorts by that list for the requesting user, falling back to name.
Alternative: a `folder_order` join table - more ceremony for a list that is small and always read
with the user.

**Send the whole ordered id list, not a delta.** The list is small (folders are counted in tens),
the write is idempotent, and it avoids merge bugs when two folders are moved at once.

**Keep checkboxes where the control is selection, use `Switch` where the control is a boolean.**
Row selection is inherently multi-choice and the shadcn `Switch` has no indeterminate state, so the
registry tables keep checkboxes; the Settings page and boolean filters move to `Switch`.

## Risks / Trade-offs

- [`@dnd-kit` adds ~15-25 KB gzip] -> recorded against the bundle-size evidence the pilot already
  collects in CI.
- [Per-user order goes stale when a folder is deleted] -> the read path filters unknown ids and the
  write path only stores ids that exist, so a stale id is ignored rather than breaking the list.
- [A drag interaction regresses touch or keyboard use] -> verify both on Stage; `@dnd-kit` ships
  keyboard sensors, and the native HTML5 attributes were already partially keyboard-hostile.

## Migration Plan

- Frontend and backend land as one pull request on `main`; Stage deploys automatically.
- The migration adds a nullable JSON column, so the rollback is a revert plus dropping the column
  (no data is derived from it).
