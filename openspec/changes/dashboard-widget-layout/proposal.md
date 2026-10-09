# Proposal

## Why

The dashboard renders its widgets in a hard-coded order with hard-coded widths, so a user who
cares about one widget cannot bring it to the top or give it more room. Widgets can only be
switched on and off in Settings, and the per-user widget list that is already stored has no effect
on the layout at all.

## What Changes

- The dashboard SHALL gain an explicit edit mode in which each widget can be dragged to another
  position, given one of three width presets (a third, a half, the full row), collapsed to its
  title and expanded again.
- The arrangement SHALL be stored per user on the server, so it survives a reload and follows the
  user to another device, and it SHALL never affect anybody else.
- Edit mode SHALL offer a reset that restores the default arrangement.
- The default arrangement SHALL reproduce the layout that exists today — the same order and the
  same widths — so nothing moves for a user who never edits it.
- Widget visibility SHALL stay in Settings. A widget that is switched off SHALL keep its saved
  position, width and collapsed state, and SHALL return with them when switched back on.
- Below the wide breakpoint the widgets SHALL stack full width in the chosen order, and drag
  rearrangement SHALL not be offered there.
- No new dependency: rearrangement reuses `@dnd-kit`, which the task board and the folder list
  already use.

## Capabilities

### New Capabilities

- `dashboard-layout`: the per-user arrangement of dashboard widgets — order, width preset,
  collapsed state, edit mode, reset, and the normalization of a stored arrangement.

### Modified Capabilities

- None. Widget visibility is unchanged, and no existing capability's requirements move.

## Impact

- Frontend: `DashboardPage.tsx` (render by arrangement, edit mode), `lib/dashboard.ts` (layout
  types, the default arrangement, normalization), `SettingsPage.tsx` (visibility stays, wording),
  `AGENTS.md` and the user guide.
- Backend: a nullable JSON column on `users` following the `folder_order_ids` precedent, its
  normalization, the `PATCH /auth/me` field, an Alembic migration (0057), and tests.
- API: `AuthUser` / `UpdateProfilePayload` gain the arrangement field.
- No new dependencies and no breaking changes.
