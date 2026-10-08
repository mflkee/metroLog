# Proposal

## Why

The `shadcn-ui-pilot` change adopts primitives from the published `metro-ui` registry, and
that registry requires Tailwind v4 (`npx shadcn@latest init` runs against v4). metroLog is on
Tailwind v3.4 with `tailwind.config.ts`, so v4 is a prerequisite for the pilot and must land
first, on its own, so it can be verified by itself.

Tailwind v4 is a substantial internal change: it replaces the PostCSS pipeline with a Vite
plugin, moves the entry point from three `@tailwind` directives to a single `@import`, switches
utility generation to native CSS cascade layers, and renames a handful of utilities. Bundled
with a component swap, a visual regression would be impossible to attribute, so this change
keeps behavior identical and touches no component.

## What Changes

- Upgrade `tailwindcss` to v4 and keep the existing `tailwind.config.ts` (custom colors, font,
  `shadow-panel`) reachable through the `@config` directive, so the bespoke design tokens stay
  the single source of truth.
- Replace the PostCSS chain with `@tailwindcss/vite`; drop `postcss`, `autoprefixer` and
  `postcss.config.js`.
- Rewrite the entry point of `src/shared/styles.css`: `@import "tailwindcss"` plus
  `@config "../../tailwind.config.ts"` instead of the three `@tailwind` directives.
- Restore the two v3 preflight defaults that v4 changed and that this UI relies on: the default
  `border-color` (from `--border-color`) and the pointer cursor on enabled buttons.
- Apply the v4 utility renames used in this codebase (`bg-gradient-to-*` -> `bg-linear-*`,
  `backdrop-blur` -> `backdrop-blur-sm`, `backdrop-blur-sm` -> `backdrop-blur-xs`,
  `outline-none` -> `outline-hidden`, `shadow-sm` -> `shadow-xs`).
- Keep every existing class, token and theme working; the 10 themes and the bespoke component
  classes are unchanged.

## Capabilities

### New Capabilities

- None. This is a dependency and build change with no user-visible behavior change.

### Modified Capabilities

- None.

## Impact

- Frontend build: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/postcss.config.js`
  (removed), `frontend/src/shared/styles.css`.
- Frontend templates: the renamed utilities in a handful of `.tsx` files.
- Bundle: v4 compiles CSS with Lightning CSS; the CSS bundle size is expected to change slightly
  and is recorded from the CI build output.
- Rollback: revert the pull request - no data, no API and no component is involved.
