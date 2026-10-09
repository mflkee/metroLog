# Design

## Context

See `proposal.md` — Why. What shapes the approach:

- `DashboardPage.tsx` renders the widgets in a hard-coded order, each wrapped in a fixed
  `xl:col-span-*` class, so order and width live in JSX, not in data.
- Which widgets a user sees is already per-user: `users.dashboard_widget_options` is a JSON list of
  widget keys, read and written through `PATCH /auth/me`. Its array order is currently meaningless
  — the page ignores it.
- `PATCH /auth/me` already stores per-user JSON preferences with server-side normalization; the
  closest precedent is `users.folder_order_ids` (migration 0053), which normalizes to known ids,
  dedupes and preserves order.
- `@dnd-kit/core` and `@dnd-kit/sortable` are already dependencies (task board, folder list), so
  rearrangement needs no new package.
- The dashboard grid is `xl:grid-cols-12`; below `xl` the grid is single-column and every widget is
  full width, so widths are a wide-screen concept only.
- The Settings page holds the widget visibility switches and the settings save flow that already
  surfaces failures.

## Goals / Non-Goals

**Goals:**

- One arrangement per user — order, width preset, collapsed state — stored on the server.
- An explicit edit mode on the dashboard that never interferes with normal reading and clicking.
- A default arrangement identical to today's layout, so the release is visually a no-op until a
  user edits.
- A stored arrangement that cannot break the page across releases.

**Non-Goals:**

- Per-folder arrangements: the dashboard scope already picks folders; the arrangement is one per
  user.
- Free-form pixel or continuous resize; only the three presets.
- Drag rearrangement below the wide breakpoint.
- Moving widget visibility out of Settings, or letting users create their own widgets.
- Changing what any widget computes.

## Decisions

### A separate `users.dashboard_layout` JSON column

Add a nullable JSON column holding an ordered list of entries, one per widget:
`{"key": "<widget key>", "size": "third|half|full", "collapsed": <bool>}`.

*Alternatives:* encode size and collapsed state into the existing `dashboard_widget_options` list.
Rejected: that column is a plain list of keys that the Settings page and several tests read as
strings, and mixing a layout into it would break them and blur "what is shown" with "how it is
placed". A separate column keeps visibility and arrangement independent, which is exactly what the
spec requires (a hidden widget keeps its arrangement).

### Three presets mapping to the existing grid

`third` → `xl:col-span-4`, `half` → `xl:col-span-6`, `full` → `xl:col-span-12`. The presets are the
three widths the page already uses, so the default arrangement is a pure data translation of the
current JSX.

*Alternatives:* drag-resize of the widget edge. Rejected: fiddly on touch, hard to test, and the
grid is discrete anyway — a continuous width would have to snap to columns to look right.

### Edit mode toggled on the dashboard

A button in the dashboard header turns editing on: drag handles, the size control, the collapse
control and a reset appear. Outside edit mode the widgets are exactly as they are today.

*Alternatives:* always-on handles (clutters the page and makes a drag fight a click); a layout
editor in Settings with a preview (the owner chose on-page editing, and a preview duplicates the
page).

### Arrangement kept as data, rendering driven by it

The page renders the normalized arrangement instead of a fixed JSX order: each entry decides the
position, the `col-span` and whether the body is shown. The composite "Сводка" widget stays a
single entry and adapts its inner columns to its own width (a third → one column, a half → two,
full → five).

### Collapse is purely visual

A collapsed widget keeps loading its data; collapse hides the body only.

*Alternative:* skip the queries of a collapsed widget. Rejected for now: it would churn the
`enabled` flags of six queries and refetch on every expand, and the dashboard scope is a handful of
folders. It can be revisited without changing the spec or the arrangement format.

### Normalization on both sides, from one rule set

The client normalizes before rendering and the server normalizes before storing: drop unknown
keys, clamp the size to the three presets, dedupe, append widgets missing from the arrangement in
the default order, and fall back to the default arrangement when the value is unreadable. This is
what makes a stored arrangement survive a widget being added or removed, and it is covered by unit
tests on the client and by backend tests for the stored value.

### Drag reuses the folder-list pattern

`DndContext` + `SortableContext` (`rectSortingStrategy`) + `useSortable`, as in the folder list, and
it is enabled only in edit mode on a wide screen. `KeyboardSensor` keeps it operable without a
pointer.

### Persistence through the existing profile endpoint

The arrangement travels in `PATCH /auth/me` next to the other preferences, so no new endpoint, and
the existing settings-style error surfacing is reused for a failed save.

## Risks / Trade-offs

- A user is allowed to see a widget in one role and not another (for example "Последние события" is
  operator-only) → the client filters the arrangement by what is visible and keeps the stored entry,
  so the widget returns with its place when the role allows it.
- Mixed spans can make dragging look jumpy → the folder-list sorting strategy is reused and a drop
  reorders the list deterministically; the Stage check covers dragging across different widths.
- Two devices editing at once → last write wins. Acceptable for a personal preference, and the
  server keeps a coherent value because it normalizes on write.
- An old client that does not know the new field → the column is nullable and ignored by code that
  does not read it, so a stale client simply shows the default arrangement.
- A layout that references a widget hidden by the user's own visibility settings → the arrangement
  entry is kept, so switching the widget back on restores its place rather than appending it.

## Migration Plan

- Additive, nullable Alembic migration `0057` (`users.dashboard_layout`); no backfill — a missing
  value means "default arrangement".
- Rollback: the older code ignores the column, so a rollback needs no data change and no user sees
  a broken dashboard. The default arrangement is identical to the pre-change layout, so the feature
  needs no flag.
