# Design

## Context

See proposal.md - Why. Constraints that shape the approach:

- The design system lives in `frontend/src/shared/styles.css`: 341 CSS custom properties
  (including `--bg-layer-1`, `--panel-bg`, `--accent-soft`, `--border-color`, `--radius-*`)
  and 28 utility classes. Ten themes switch through a `data-theme` attribute on the root.
- `frontend/components.json` exists and already points at `tailwind.config.ts`,
  `src/shared/styles.css` and the `@/components/ui` alias, but it configures no registry, so
  the shadcn MCP returns "No registries are configured". Passing `@shadcn` explicitly works
  and yields the add command for the chosen items.
- Tailwind is v3.4 with `tailwind.config.ts`, which the shadcn CLI supports.
- The app deliberately does not close modals on outside click (see
  `src/components/Modal.tsx`), which shipped recently and must not regress.
- Verification happens on Stage through CI; there is no local run.

## Goals / Non-Goals

**Goals:**

- A repeatable way to search and add vetted primitives through the shadcn MCP.
- Adopted primitives that inherit all 10 themes with no per-theme code.
- The existing dialog dismissal contract preserved exactly.

**Non-Goals:**

- Migrating existing pages or replacing `.btn-*` and `.form-input` wholesale.
- Replacing the bespoke modal with a different user-visible behavior.
- Introducing a second theming mechanism.

## Decisions

**Hybrid adoption of 3-5 primitives, not a migration.** Adopt dialog, dropdown-menu,
select, tooltip and tabs; keep the bespoke system everywhere else. Rationale: the defects
come from interactive primitives, not from layout, so the value is concentrated there.
Alternative: full migration - rejected at roughly 10-15 days of churn across 2,780 class
usages and 60 files.

**Map existing tokens into the library's CSS variables instead of adopting its themes.**
Define the library's expected variables (`--background`, `--foreground`, `--border`,
`--radius`, and so on) in terms of our tokens, per theme. Rationale: it keeps the 10-theme
switch as the single source of truth and prevents a parallel palette. Alternative: use the
library's slate base color and re-theme - rejected because it would fork theming.

**Keep our Modal contract by disabling the library's outside-click dismissal.** The Radix
dialog primitive dismisses on outside interaction by default; the adopted wrapper sets that
off and keeps the explicit close control and Escape. Rationale: preserves the behavior the
dismissal spec requires and the change we already shipped.

**Pilot on the task pages.** They are recent, mid-sized and already use the shared composer
components. Rationale: the pilot exercises a real flow (board, card, filters) without
touching the two largest pages, which `refactor-hotspots` is still splitting.

**Register `@shadcn` in `components.json` before anything else.** Rationale: without a
registry the MCP cannot search or vet items, so every later step would fall back to manual
copies.

**Use the published `metro-ui` registry as the source of primitives (decided after metroCheck
shipped and metro-ui was published).** `metro-ui` is a shadcn registry
(`https://raw.githubusercontent.com/mflkee/metro-ui/main/public/r/{name}.json`) offering
`metro-theme`, `theme-provider`, `theme-toggle`, `status-badge`, `stat-card`, `page-header` and
`app-shell`. Rationale: it is the shared design source for the `metro*` services, so adopting it
keeps metroLog aligned with metroCheck instead of forking a second shadcn setup. Alternative:
raw `@shadcn` items - still needed for the interactive primitives (dialog, dropdown-menu,
select, tooltip, tabs) that metro-ui does not ship.

**Tailwind v4 is a prerequisite, and it landed first as its own change (`tailwind-v4-upgrade`).** `metro-ui` requires `npx shadcn@latest init` on Tailwind v4, while metroLog was on v3.4 with `tailwind.config.ts`. Rationale: the v4 migration touches the config, the token layer and every utility class, so it had to be verifiable on its own (build + all 10 themes) before any component swap. Status: done - metroLog now runs Tailwind v4 through `@tailwindcss/vite`, keeps `tailwind.config.ts` via `@config`, and all 341 tokens and 10 themes are unchanged. The remaining follow-up for the pilot is the v4 shape of `frontend/components.json` (drop the `tailwind.config` field that v3 used).

**Keep metroLog's 10 themes; adopt presentational items only.** `status-badge`, `stat-card` and
`page-header` are token-driven and can read metroLog's variables, so they can be adopted without
touching theming. `app-shell` and `theme-provider` assume light/dark and would replace the
10-theme model, which is a product decision - deferred, not silently dropped.


## Risks / Trade-offs

- [Radix adds 50-100 KB gzipped] -> adopt only five primitives and measure the bundle in CI
  after the pilot.
- [Token names clash with the library's variables] -> map one way (our tokens feed the
  library's variables) and check all 10 themes on the pilot page.
- [The pilot pulls the library's styling conventions into the codebase] -> confine new
  components to `src/components/ui/` and keep page code using our existing classes.
- [Wider adoption happens by accident] -> `AGENTS.md` records that this is a pilot with a
  fixed inventory, and only the pilot pages import from `src/components/ui/`.

## Migration Plan

- Land as a single pull request on `main`; Stage deploys automatically.
- Rollback is a revert of that pull request: removing `src/components/ui/` and the
  dependency entries restores the previous state, and no data is involved.
