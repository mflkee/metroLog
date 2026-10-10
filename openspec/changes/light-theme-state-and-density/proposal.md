# Proposal

## Why

0.4.0 shipped the reworked light theme, and the owner still finds it the one weak theme. Three
things came back:

- the borders read as *too thin*: on a dark theme a hairline blends into the panel, on white the
  same 1px line shows the pixel grid and looks uneven when the page is zoomed out;
- the muted grey is hard to read on white;
- the collapsed navigation rail puts every icon in a border, and a *selected* item adds a second,
  blue border — a rectangle around the row. The owner asked for the GitHub behaviour instead: a
  hover or a selection changes the **background**, not the border colour.

Two product defaults came back as well:

- every dashboard widget and every theme should be on for everybody out of the box (today the
  theme switcher starts with two themes, and a user whose stored list was trimmed keeps a trimmed
  switcher);
- a dashboard module should show *different* content at different widths — a 1/3 module condensed,
  a 1/1 module carrying more (the owner's example: the tasks widget).

## What Changes

- The light theme SHALL use a border strong enough to survive a hairline on white, and a muted text
  colour that reads comfortably on white and on the canvas.
- Interactive state (hover, active, selected) SHALL be carried by the surface: a background change,
  never a border-colour change. Keyboard focus SHALL stay visible through an outline.
- A user who has not chosen SHALL get **every** dashboard widget and **every** theme; a stored
  `null` SHALL mean "the default". Stored lists SHALL be reset to `null` once, so the change reaches
  the accounts that already saved a trimmed list.
- A dashboard module SHALL render more of its content the wider its width preset is: `third` shows
  the identity and one fact, `half` adds the next most useful field, `full` shows everything the
  module has.

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
