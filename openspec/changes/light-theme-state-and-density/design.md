# Design

## Context

- `:root` is the light theme's block in `src/shared/styles.css`, with every other theme overriding
  the same tokens under `:root[data-theme="..."]`. Cards in this app are drawn by their **border
  alone** (their background comes from the tone ladder or, outside a tone context, from the
  `@layer base` card rule added in 0.4.0).
- The light theme's second pass (0.4.0) set `--border-color: #bfc9d4` (1.71 on white),
  `--border-strong: #a3aeba` (2.25) and text `#1f2328` / `#5b6673` (15.8 / 5.8 on white).
- A state is currently marked in two ways: a border colour (`border-signal-info`,
  `hover:border-signal-info`, `.icon-action-button:hover { border-color: var(--accent) }`, …) and a
  background (`bg-[var(--accent-soft)]`). There are 29 `hover:border-*` sites in TSX plus ~15 CSS
  rules that recolour a border on `:hover`/`:focus-visible`.
- `enabled_theme_options` is `null` for users who never opened the theme list, and the frontend
  falls back to `defaultVisibleThemes = ["dark", "light"]`. `dashboard_widget_options` falls back to
  **all** widgets already, so the widget half of the default request is a data reset, not a code
  change. `dashboard_layout` is `null` for everybody but the owner, so his arrangement becomes the
  default by changing the constants alone.
- `renderWidgetBody(key, size)` already receives the width preset; only `summary_cards` uses it.

## Goals / Non-Goals

**Goals**

- A curated, dark-only catalogue: no light theme and no near-duplicate of the neutral dark one.
- One rule for interactive state across the whole app: state is a surface, not a border.
- All widgets and all themes on by default, for everybody, and the owner's arrangement as the default
  one.
- Dashboard modules whose content density follows the width preset.

**Non-Goals**

- Retuning the dark themes beyond the chart palette (they were accepted).
- Replacing borders with shadows as the card pattern (the border stays the card's outline).
- Redesigning every widget's data (density only decides *how much* of it is shown).

## Decisions

**The light theme was removed, not refined.** Two rounds went into it — a stronger border
(`--border-color` 1.71 → 2.06 on white), darker muted text (5.8 → 7.3), a tinted canvas and white
cards — and the owner's verdict was still that it does not fit the product. `moonfly` went with it:
its palette sat close enough to the neutral `dark` that the two read as one theme. The consequences
are structural rather than cosmetic:

- `:root` now carries the **dark** palette and the `:root[data-theme="dark"]` block is gone (an
  explicit `dark` falls back to `:root`), so the stylesheet has one base instead of a light base with
  eight overrides;
- `applyTheme` always sets `color-scheme: dark`;
- a stored preference for a removed theme (`light`, `moonfly`, and the earlier `gray`/`flexoki`) is
  coerced to `dark` rather than leaving the user themeless;
- the **enum keeps the retired members**. A client with a cached bundle can still send `light`, and a
  422 there would be a broken account for no reason — the request is accepted and the applied theme is
  `dark`. Migration `0062` moves the stored `theme_preference` to `DARK` so the data matches the
  catalogue (writing the enum *name*, per the `theme_preference` trap in `AGENTS.md`).
- the picker shows the name alone: the `source` field (`folke/tokyonight.nvim`) and the «Текущий»
  chip are gone, and the selected option is marked by its background.

**The default arrangement is the owner's own.** It was read off his account and tiles the twelve
column grid exactly: `full` → three `third`s → two rows of two `half`s → `full`. A default that leaves
a hole is the one thing a user cannot fix without arranging everything by hand, so the tiling is
asserted in both the frontend (`dashboard.test.ts`) and the backend (`_normalize_dashboard_layout`
falls back to these widths, covered in `test_auth.py`).

**One state rule, applied mechanically: state is a background.** Resting chrome (a field's or a
button's outline, a card's outline, a status badge's tinted outline) keeps its border; what a
hover, a selection or an active tab may *not* do is change a border's colour. Consequences:

- the rail's icon badge loses its border and its background — the icon is just an icon, and the
  nav row's background answers the hover;
- **collapsed, the rail's highlight is a square around the icon** (`lg:h-11 lg:w-11 lg:mx-auto`): the
  row there *is* the icon, so the previous row-shaped pill came out taller than it was wide and read
  as a stretched rectangle;
- a selected nav row / chip / tab is `--accent-soft` over the panel, with no border recolour;
- `:focus-visible` keeps a real outline (`outline: 2px solid var(--accent); outline-offset: 2px`),
  because removing the border recolour must not remove the keyboard affordance. This is the one
  place the app adds a ring, and it is a keyboard-only ring, exactly like GitHub.

**Default = everything, and `null` means default.** The frontend default for visible themes becomes
the whole catalogue, and the migration sets both `dashboard_widget_options` and
`enabled_theme_options` to `null` for every user. `null` already means "the default" on the read
path, so a widget or a theme added later shows up for everybody without another migration — which is
the property the owner actually wants ("пусть по дефолту у всех"). A user who wants to hide
something still can: that stores a list.

**Density is a property of the width preset, not of the viewport.** The module's own width decides
what fits, so the choice is made from `size` (already threaded into `renderWidgetBody`) rather than
from a `sm:`/`lg:` breakpoint, which would read the viewport and get a 1/3 module wrong on a wide
screen.

Density ladder used by the list modules (tasks is the model):

| Preset | Tasks | Locations / events / expiry | Two-card modules |
|---|---|---|---|
| `third` | title, status, due date | one line of meta | one column |
| `half` | + priority, folder | + the next field (serial/user/kind) | two columns |
| `full` | the task table (see below) | + the remaining fields, more rows | two columns |

**A full-width tasks module is a table, not a card.** A card at twelve columns leaves its middle
empty — the title on the left, the deadline on the right, nothing between them — and is three lines
tall. The module reuses the table the task list page already renders: the same seven columns in the
same order, and the same `StatusBadge` for the status. That is both *fuller* (the width is used) and
*more compact* (one row per task instead of three lines), which is exactly the pair the owner asked
for.

It is a **real `<table>` with `width: 100%`**, not a grid with fixed tracks. The owner's second round
made the difference visible: a grid row has to give every column the same width in every row, so the
title column is either fixed (and leaves a hole after a short title, which is what he saw) or
`fr`-flexible (and steals the room the responsible needs, so the name was truncated). A table lets the
browser size each column to its content and spread the leftover width across the columns, which fixes
both at once. Measured in Chromium at the step boundaries: seven columns at 1280px give the title
556px, the responsible 194px (it needs 149), and no column more than ~80px of slack; the title stays
the widest column at every width, and the rows stay one line tall (a very long title wraps, as it does
on the task list page).

The columns appear as the **module** widens, measured with a container query — the module body is a
`@container` and the steps are `@xl` (36rem) and `@5xl` (64rem) — because a viewport breakpoint would
read a full-width module on a narrow screen as wide.

**Tailwind reads the source text, so the table classes are literal.** The visibility classes cannot be
assembled at runtime — the scanner would never see them and no CSS would be emitted (verified: without
the literals there is no `@container (min-width:…)` in the bundle at all) — and a table cell has to
become `table-cell`, not `block`, or the table layout falls apart. `taskTable.test.ts` pins the steps,
the column order and the visibility class of every column.

## Risks / Trade-offs

- Removing a theme is a taste call, and it is irreversible for a user who liked it; the owner made
  the call for both the light theme and `moonfly`, and the retired enum members keep a stale client
  from breaking.
- Removing the border recolour can make a hover subtler; the accent-tinted backgrounds are a step
  stronger than before to compensate.
- The data migration resets deliberate choices (owner-approved): after it, "everything is on" is the
  single truth, and per-user lists start empty.
- The default arrangement is the owner's taste baked in; it is one array in `dashboard.ts` and the
  backend mirror, and the tiling test keeps a future edit from leaving a hole.
