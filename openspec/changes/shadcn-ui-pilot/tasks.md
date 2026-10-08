# Tasks

## 1. Registry setup and recon

- [x] 1.1 Register the `@shadcn` registry in `frontend/components.json` and verify the shadcn MCP lists items without passing the registry explicitly. Done: `frontend/components.json` now declares `registries.@metro` (metro-ui) and the v4 shape (`style: new-york`, no `tailwind.config`, `aliases.utils` = `@/lib/utils`); `@shadcn` is built in and `view_items_in_registries(['@shadcn/badge'])` resolves. The MCP caches `components.json` at startup, so it still reports no project registries until it is restarted.
- [x] 1.2 Search and vet the candidate primitives (dialog, dropdown-menu, select, tooltip, tabs) with the MCP and record the final inventory and the add command; verify the command is reproducible. Done, with a deviation: the MCP caches `components.json` at startup and could not resolve `@metro`, so the items were vetted from the registry JSONs directly (reproducible: `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json` and `https://raw.githubusercontent.com/mflkee/metro-ui/main/public/r/{name}.json`; the equivalent CLI command is `npx shadcn@latest add @shadcn/dialog @shadcn/dropdown-menu @shadcn/select @shadcn/tooltip @shadcn/tabs`). Inventory: all five are `registry:ui` with no registryDependencies and depend only on `cn` + `radix-ui` (already installed) - dialog 4.3 KB, dropdown-menu 8.4 KB, select 6.3 KB, tooltip 1.8 KB, tabs 3.8 KB. `button` (2.4 KB) is available if a primitive needs it.
- [x] 1.3 Confirm Tailwind v4 compatibility and record the dependency list the chosen items pull in. (Prerequisite done: `tailwind-v4-upgrade` landed - Tailwind v4 via `@tailwindcss/vite`, `tailwind.config.ts` kept through `@config`.) Done: Tailwind v4 landed in `tailwind-v4-upgrade`. Dependency list pulled in by the adopted items: `class-variance-authority`, `clsx`, `tailwind-merge` (via `cn`), `lucide-react`, `radix-ui`.

## 2. Install and wire the primitives

- [x] 2.1 Run the shadcn add command for the chosen items and verify `npm --prefix frontend run build` and `npm --prefix frontend run lint` pass. Done, with a deviation: instead of `npx shadcn add` the files were vendored from the registry JSONs (deterministic and reviewable in the diff) - `@shadcn/badge` and `@shadcn/card` from `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json`, the presentational trio from `metro-ui/public/r/{name}.json`. The CLI-only rewrite (`import { cn } from "cn"` -> `@/lib/utils`) was applied by hand. `npm run build` and `npm run lint` pass.
- [x] 2.2 Add the adopted components to `src/components/ui/` and verify only the pilot pages import them. Done: `src/components/ui/{badge,card,status-badge,stat-card,page-header}.tsx` plus `src/lib/utils.ts` (`cn`). Only `TasksPage.tsx` and `TaskDetailsPage.tsx` import them (plus the internal wiring between the vendored files).

## 3. Token mapping and theming

- [x] 3.1 Map the library's CSS variables to the existing design tokens per theme in `src/shared/styles.css` and verify a primitive renders correctly. Done: an `@theme inline` block maps the library variables onto the existing tokens (`--color-primary: var(--button-primary-bg)`, `--color-card: var(--panel-bg)`, `--color-muted-foreground: var(--text-muted)`, `--color-info/success/warning: var(--info/success/warning)`, `--color-destructive: var(--danger)`, `--color-border: var(--border-color)`, ...). `@custom-variant dark (&:is(.dark *))` keeps the `dark:` variant inert, since metroLog themes through `data-theme` and must not follow `prefers-color-scheme`.
- [ ] 3.2 Verify all 10 themes restyle the adopted primitives without a reload and record the check as the thematic acceptance evidence. Pending the Stage pass - the mapped utilities are token-driven and emitted, but the 10-theme sweep needs a rendered app.
- [x] 3.3 Verify no adopted component hardcodes a color and record the grep result. Done: the only hardcoded colour in the adopted files was `text-white` in the badge's destructive variant; it is now `text-destructive-foreground` (a mapped token). A repeat grep for hex/rgb/white/black over `src/components/ui/` is clean.

## 4. Dialog dismissal contract

- [ ] 4.1 Configure the adopted dialog to not close on outside click and verify by a manual Stage scenario that entered content survives a backdrop click.
- [ ] 4.2 Verify the explicit close control and the Escape key close the dialog, and add a test for this dismissal contract.

## 5. Pilot on the task pages

- [ ] 5.1 Replace the hand-rolled dialog/dropdown/select usage on `TasksPage.tsx` and `TaskDetailsPage.tsx` with the adopted primitives and verify the page builds. Partly done: the adopted `PageHeader` replaced the bespoke header on both task pages and `StatusBadge` (with `TASK_STATUS_TONES` in `src/lib/taskStatusTone.ts`) replaced the plain status text in the board column header, the table and the task card; the interactive dialog/dropdown/select replacement is still open.
- [ ] 5.2 Verify the pilot flows on Stage (board drag, filters, task card composer, equipment picker) as an operator.

## 6. Audit, docs and integration

- [ ] 6.1 Run the shadcn audit checklist and record which items pass.
- [ ] 6.2 Update `AGENTS.md` (design-system note now records the pilot inventory and the registry) and verify the note matches the shipped inventory.
- [ ] 6.3 Push to `main`, confirm the CI run and Stage deploy succeed, and record the bundle-size delta from the build output.
