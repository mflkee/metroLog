# Proposal

## Why

Red is the app's error colour, and it is not always readable. `--danger` is one value for every
theme, and measured on each theme's panel it reads at 3.48 in nord, 4.33 in dracula and 4.35 in
catppuccin - under the AA the conventions ask of a colour that carries text. The bespoke danger
button was worse: `.btn-danger` painted its label with a raw `#b04c43` (1.90-3.38 in every theme),
which the legacy-literal compatibility layer never touched, because that layer only rewrites Tailwind
class names.

## What Changes

- A colour that carries text SHALL hold AA on its theme's panel. The danger red therefore gets a
  text twin, `--danger-text`: `--danger` by default, lightened in the three themes where the shared
  red falls short.
- `--danger` SHALL keep painting surfaces (tints, borders, a solid background), so nothing that
  reads as a surface changes.
- Every danger *foreground* SHALL use `--danger-text`: the error and overdue text, the danger
  button's label, the danger icon actions, and the danger tones of the stat card and status badge.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the requirement that a colour carrying text holds AA on its theme.

## Impact

- Frontend only: `src/shared/styles.css` (the token, the button, the icon actions and the legacy
  mapping), `src/lib/processStages.ts`, `src/lib/taskTable.ts`, and the twenty-two danger-text call
  sites across the pages and the pilot components. No API, schema or data change.
