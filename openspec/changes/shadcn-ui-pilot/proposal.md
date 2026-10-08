# Proposal

## Why

The UI is a bespoke design system: 341 CSS custom properties, 10 themes selected through a
`data-theme` attribute, and 2,780 className usages (`.form-input` alone appears 175 times).
Dialogs, dropdowns and selects are hand-rolled, which is exactly where the recent defects came
from - a modal that closed on a backdrop click and lost typed text. A small, vetted set of
accessible primitives removes that class of bug.

Since this proposal was written, `metroCheck` adopted shadcn and a shared registry
**`metro-ui`** (`mflkee/metro-ui`) was published for the `metro*` services. It ships
`metro-theme` (light/dark tokens, Geist), `theme-provider`, `theme-toggle`, `status-badge`,
`stat-card`, `page-header` and `app-shell`, and it **requires Tailwind v4**. This is now the
preferred source of primitives, so the pilot adopts from that registry instead of raw shadcn.

**Open product decision (blocks the theming part):** `metro-ui` offers two themes (light/dark),
while metroLog exposes **10 themes via `data-theme`**, which is a user-facing feature. The
pilot therefore adopts the presentational items only (`status-badge`, `stat-card`,
`page-header`) and keeps metroLog's theming; `app-shell` and the light/dark theme are deferred
until it is decided whether metroLog keeps 10 themes or simplifies to light/dark.


## What Changes

- Register the `@shadcn` registry in `frontend/components.json` so the shadcn MCP can
  search and vet items; today no registry is configured and the MCP returns nothing.
- Adopt a pilot set of primitives - dialog, dropdown-menu, select, tooltip, tabs - mapped
  onto the existing design tokens, with all 10 themes working through `data-theme`.
- Preserve the dismissal contract: dialogs SHALL NOT close on a backdrop click; they close
  only through an explicit control or the Escape key.
- Pilot the primitives on the task pages (board, card, filters) and nowhere else.
- Leave the bespoke system in place everywhere the pilot does not touch; `.btn-*` and
  `.form-input` keep working.
- Update `AGENTS.md`, which currently states "no shadcn/ui".

## Capabilities

### New Capabilities

- `ui-design-system`: the behavior contract for theming, dialog dismissal and control
  behavior that the UI must preserve while adopting shared primitives.

### Modified Capabilities

- None.

## Impact

- Frontend: `components.json` (registry), `src/shared/styles.css` (token mapping),
  `src/components/ui/*` (new components), `src/components/Modal.tsx` (pilot consumer),
  `src/pages/TasksPage.tsx` and `src/pages/TaskDetailsPage.tsx` (pilot pages).
- Dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` and
  the `@radix-ui/*` packages the chosen items require, all added by the shadcn CLI.
- Bundle: an expected increase of roughly 50-100 KB gzipped from Radix.
- Documentation: the design-system note in `AGENTS.md`.
