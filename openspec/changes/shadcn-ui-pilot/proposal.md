# Proposal

## Why

The UI is a bespoke design system: 341 CSS custom properties, 10 themes selected through a
`data-theme` attribute, and 2,780 className usages (`.form-input` alone appears 175
times). Dialogs, dropdowns and selects are hand-rolled, which is exactly where the recent
defects came from - a modal that closed on a backdrop click and lost typed text, and a
version badge that had to be added by hand. A small, vetted set of accessible primitives
removes that class of bug. `frontend/components.json` already points at our Tailwind
config and stylesheet, so a hybrid adoption is cheap to try and easy to revert.

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
