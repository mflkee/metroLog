# Proposal

## Why

0.4.0 shipped the reworked light theme, and the owner's verdict was that it is the one theme that
does not fit: the borders read as too thin on white, the muted grey was hard to read, and the
collapsed rail put every icon in a border with a second, blue border around the selected row — he
asked for the GitHub behaviour instead, where a hover or a selection changes the **background**.

Two rounds later the verdict on the light theme itself changed: the owner asked to remove it
outright ("выкорчевать"), together with `moonfly`, which reads as a second neutral dark. The picker
was also asked to show a theme's name and nothing else.

Two product defaults came back as well:

- every dashboard widget and every theme should be on for everybody out of the box (today the
  theme switcher starts with two themes, and a user whose stored list was trimmed keeps a trimmed
  switcher);
- the default arrangement should be the one the owner arranged for himself;
- a dashboard module should show *different* content at different widths — a 1/3 module condensed,
  a 1/1 module carrying more (the owner's example: the tasks widget, which then had to become a
  table because a full-width card left its middle empty).

## What Changes

- The application SHALL ship dark themes only. The light theme and `moonfly` SHALL be removed from
  the catalogue, from the stylesheet and from the stored preferences, and a stored preference for a
  removed theme SHALL fall back to the neutral dark theme.
- The theme picker SHALL show the theme's name and nothing else.
- Interactive state (hover, active, selected) SHALL be carried by the surface: a background change,
  never a border-colour change, and the collapsed rail's highlight SHALL be a square around the
  icon. Keyboard focus SHALL stay visible through an outline.
- A user who has not chosen SHALL get **every** dashboard widget and **every** theme; a stored
  `null` SHALL mean "the default". Stored lists SHALL be reset to `null` once, so the change reaches
  the accounts that already saved a trimmed list.
- The default dashboard arrangement SHALL be the owner's arrangement, and it SHALL tile the
  twelve-column grid with no hole.
- A dashboard module SHALL render more of its content the wider its width preset is: `third` shows
  the identity and one fact, `half` adds the next most useful field, `full` shows everything the
  module has — and the full-width tasks module SHALL be a table (the same one the task list page
  uses) rather than a card, so the width is used and the rows stay compact.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the state-affordance, the light-theme contrast floor, the widget-density
  and the default-everything expectations.

## Impact

- Frontend: `src/shared/styles.css` (light tokens, state rules), `components/layout/Sidebar.tsx`
  (rail), the pages that marked a state with a border, `store/theme.ts` (default visible themes),
  the dashboard widgets (`pages/DashboardPage.tsx`, `components/MyTasksWidget.tsx`,
  `lib/dashboard.ts`).
- Backend: one data migration (`0060`) resetting the two preference lists to `null`; no API change.
- No new dependency.
