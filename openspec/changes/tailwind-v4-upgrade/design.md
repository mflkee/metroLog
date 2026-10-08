# Design

## Context

Constraints that shape the approach:

- The design system lives in `frontend/src/shared/styles.css` (2,337 lines): 341 CSS custom
  properties, 10 themes through `data-theme`, and the bespoke component classes
  (`.form-input`, `.btn-*`, `.panel*`, the date-picker and autocomplete families). The three
  `@tailwind` directives sit at the very top; the tokens follow; the component classes start
  after them.
- `tailwind.config.ts` defines only what the templates actually use: `ink`, `mist`, `steel`,
  `line`, `signal.*` colors, the IBM Plex Sans stack and `shadow-panel`. There are no plugins.
- The measured utility usage that v4 changes: 293 bare `border` (286 with an explicit
  border-color, 7 relying on the default), 222 `space-y-*`, 3 `bg-gradient-to-*`, 2 bare
  `backdrop-blur`, 1 `backdrop-blur-sm`, 1 `outline-none`, 1 `shadow-sm`. No bare `ring`,
  `rounded`, `shadow`, `blur`, no opacity modifiers, no `divide-*`, no `@apply`.
- The only state utility applied together with a bespoke class is `disabled:opacity-60` (25
  times on `.btn-*`), and it does not overlap a property those classes set.
- Verification is on Stage through CI; local `npm run check` (tsc, eslint, vitest, build) is
  the fast feedback loop used throughout `refactor-hotspots`.

## Goals / Non-Goals

**Goals:**

- Tailwind v4 in place with byte-for-byte identical rendering for the current UI.
- The existing tokens, 10 themes and bespoke classes unchanged and still authoritative.
- A dependency and build change that is verifiable by the standard check suite.

**Non-Goals:**

- Moving the theme into a CSS-first `@theme` block, or migrating `tailwind.config.ts` away.
- Restructuring `styles.css` into `@layer` blocks.
- Adopting any shadcn/metro-ui component; that is the next change in the pilot.

## Decisions

**Keep `tailwind.config.ts` through `@config` instead of moving to CSS-first `@theme`.**
Rationale: the custom colors are referenced by hundreds of class usages (`text-ink` 290,
`text-steel` 619, `border-line` 422, `shadow-panel` 75); rewriting them as `@theme` variables is
churn with no user value and would put the design tokens in two places. Alternative: full
CSS-first migration - deferred; it can happen separately once v4 has landed.

**Use `@tailwindcss/vite` instead of `@tailwindcss/postcss`.** Rationale: the frontend is Vite,
the plugin is the documented path for Vite, it removes the PostCSS/Autoprefixer chain and it
compiles with Lightning CSS. Alternative: keep PostCSS - rejected because it keeps a second
integration path alive for no reason.

**Keep the bespoke component CSS unlayered.** In v4, `@import "tailwindcss"` puts generated CSS
into native cascade layers, and unlayered CSS beats layered CSS of any specificity. In v3 the
bespoke classes also came after `@tailwind utilities`, so they already beat plain utilities
(`.form-input` over `border-line`), and the only state utility used with them
(`disabled:opacity-60`) sets a property they do not. Unlayered therefore reproduces the v3
result for every observed case, whereas wrapping the file in `@layer components` would flip the
plain-utility case. Alternative: layer the file - rejected as both riskier and not equivalent.

**Restore the two v4 preflight changes this UI depends on.** v4 changed the default
`border-color` to `currentColor` and removed the `cursor: pointer` that v3 applied to buttons.
Both are visible here (7 conditional borders; 159 buttons, few of which set a cursor
themselves), so a small `@layer base` block restores the v3 defaults, taking the border colour
from the existing `--border-color` token rather than a hardcoded grey.

**Rename utilities rather than accept the shifted meaning.** The v4 renames
(`bg-gradient-to-*`, `backdrop-blur*`, `outline-none`, `shadow-sm`) are cosmetic renames; doing
them keeps the pixels identical instead of silently resizing shadows and blur.

**Let `space-y-*` semantics change.** v4 sets the margin on all-but-last where v3 set it on
all-but-first. The total spacing between siblings is the same, and every `space-y` usage here is
a stacked block layout; forcing the old behaviour would need `:where()` overrides for no gain.

## Risks / Trade-offs

- [A renamed utility slips through and renders differently with no build error] -> the rename
  list is derived from a full token scan and applied exhaustively; the Stage smoke pass covers
  the visual result.
- [An unlayered bespoke class now beats a utility it previously tied with] -> measured: the only
  co-occurrence is `disabled:opacity-60`, which does not overlap; recorded for future authors.
- [`@config` loading a TypeScript config under Vite] -> the Vite plugin resolves TS configs;
  verified by the build producing the custom-colour utilities.
- [CSS bundle size moves] -> recorded from the CI build output; v4 usually shrinks it.

## Migration Plan

- Land as a single pull request on `main`; Stage deploys automatically.
- Rollback is a revert of that pull request: the previous dependency list, `postcss.config.js`
  and the `@tailwind` directives restore the v3 build. No data is involved.
