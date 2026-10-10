# Design

## Context

- The light theme is the `:root` block of `src/shared/styles.css`; every other theme overrides the
  same tokens under `:root[data-theme="..."]`. Cards in this app are drawn by their **border alone**
  (their background comes from the tone ladder or, outside a tone context, from the `@layer base`
  card rule added in 0.4.0).
- The light theme's second pass (0.4.0) set `--border-color: #bfc9d4` (1.71 on white) and
  `--border-strong: #a3aeba` (2.25) and text `#1f2328` / `#5b6673` (15.8 / 5.8 on white).
- A state is currently marked in two ways: a border colour (`border-signal-info`,
  `hover:border-signal-info`, `.icon-action-button:hover { border-color: var(--accent) }`, …) and a
  background (`bg-[var(--accent-soft)]`). There are 29 `hover:border-*` sites in TSX plus ~15 CSS
  rules that recolour a border on `:hover`/`:focus-visible`.
- `enabled_theme_options` is `null` for users who never opened the theme list, and the frontend
  falls back to `defaultVisibleThemes = ["dark", "light"]`. `dashboard_widget_options` falls back to
  **all** widgets already, so the widget half of the default request is a data reset, not a code
  change.
- `renderWidgetBody(key, size)` already receives the width preset; only `summary_cards` uses it.

## Goals / Non-Goals

**Goals**

- A light theme whose borders and muted text hold up on white, including at a zoomed-out viewport.
- One rule for interactive state across the whole app: state is a surface, not a border.
- All widgets and all themes on by default, for everybody.
- Dashboard modules whose content density follows the width preset.

**Non-Goals**

- Retuning the dark themes (their borders and muted text were accepted).
- Replacing borders with shadows as the card pattern (the border stays the card's outline).
- Redesigning every widget's data (density only decides *how much* of it is shown).

## Decisions

**Light theme: darken both border tokens one clear step, darken the muted text, keep the canvas.**
Measured contrast on white (WCAG):

| Token | 0.4.0 | now | on white |
|---|---|---|---|
| `--border-color` (cards, separators) | `#bfc9d4` (1.71) | `#a9b6c4` | 2.07 |
| `--border-strong` (controls, fields) | `#a3aeba` (2.25) | `#8494a5` | 3.11 |
| `--text-muted` (secondary text) | `#5b6673` (5.8) | `#4c5866` | 7.3 |
| `--text-primary` | `#1f2328` | unchanged | 15.8 |

A 1px line is antialiased across two device rows whenever it does not land on a device pixel
boundary (zoom, fractional DPR). Contrast is what decides whether that reads as a line or as a
ripple, so the fix is contrast, not a thicker stroke: the card border is deliberately above the
GitHub-ish `#d0d7de` (1.5) and the control border sits near Radix step 8. The canvas stays
`#e6eaf1` so the cards keep reading as white surfaces on top of it.

**One state rule, applied mechanically: state is a background.** Resting chrome (a field's or a
button's outline, a card's outline, a status badge's tinted outline) keeps its border; what a
hover, a selection or an active tab may *not* do is change a border's colour. Consequences:

- the rail's icon badge loses its border and its background — the icon is just an icon, and the
  nav row's background answers the hover;
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
for. The columns appear as the **module** widens, measured with a container query — the module body
is a `@container` and the steps are `@xl` (36rem) and `@5xl` (64rem) — because a viewport breakpoint
would read a full-width module on a narrow screen as wide.

**Tailwind reads the source text, so the table classes are literal.** A `grid-cols-[…]` template or
a `hidden @xl:block` assembled at runtime is never seen by the scanner and no CSS is emitted for it
(verified: without the literals there is no `@container (min-width:…)` in the bundle at all). The row
template and the per-column visibility are therefore two halves of one contract, written twice by
hand. `taskTable.test.ts` compares them — the track count at each step must equal the number of
columns visible at that step — and the build is checked to emit the container rules.

## Risks / Trade-offs

- A darker border is a taste call; the owner reviews it on Stage. The tokens are the single knob
  (`--border-color` / `--border-strong`) and the canvas colour was left alone on purpose, so a
  follow-up round is a one-line change.
- Removing the border recolour can make a hover subtler; the accent-tinted backgrounds are a step
  stronger than before to compensate.
- The data migration resets deliberate choices (owner-approved): after it, "everything is on" is the
  single truth, and per-user lists start empty.
