# Tasks

## 1. Dependencies and build wiring

- [x] 1.1 Upgrade `tailwindcss` to v4 and add `@tailwindcss/vite`; remove `postcss` and `autoprefixer` from `frontend/package.json` and delete `frontend/postcss.config.js`. Done: `tailwindcss` and `@tailwindcss/vite` at ^4.3.3; `postcss` and `autoprefixer` removed and `postcss.config.cjs` deleted (its Dockerfile COPY line dropped too).
- [x] 1.2 Add the `tailwindcss()` Vite plugin to `frontend/vite.config.ts` and verify `npm --prefix frontend run build` passes. Done: `tailwindcss()` added to the Vite plugin list; the production build passes.

## 2. Entry point and preflight parity

- [x] 2.1 Replace the three `@tailwind` directives in `src/shared/styles.css` with `@import "tailwindcss"` and `@config "../../tailwind.config.ts"`; verify the custom-colour utilities (`text-ink`, `border-line`, `shadow-panel`) are still emitted. Done: `@import "tailwindcss"` + `@config "../../tailwind.config.ts"`; the built CSS still emits `.text-ink`, `.border-line`, `.shadow-panel`, `.border-signal-info`.
- [x] 2.2 Restore the v3 preflight defaults in a `@layer base` block: default `border-color` from `--border-color` and the pointer cursor on enabled buttons; verify the 7 border-only usages and the button cursor. Done: a `@layer base` block restores `border-color: var(--border-color)` on all elements and `cursor: pointer` on enabled buttons; both are present in the built CSS.

## 3. Utility renames

- [x] 3.1 Apply the v4 renames in the templates: `bg-gradient-to-*` -> `bg-linear-*` (3), `backdrop-blur` -> `backdrop-blur-sm` (2), `backdrop-blur-sm` -> `backdrop-blur-xs` (1), `outline-none` -> `outline-hidden` (1), `shadow-sm` -> `shadow-xs` (1). Done: 3 `bg-gradient-to-t` -> `bg-linear-to-t`, 2 bare `backdrop-blur` -> `backdrop-blur-sm`, 1 `backdrop-blur-sm` -> `backdrop-blur-xs`, 1 `outline-none` -> `outline-hidden`, 1 `shadow-sm` -> `shadow-xs`.
- [x] 3.2 Re-run the token scan and confirm no v3-renamed utility remains and that no bare `ring`/`rounded`/`shadow`/`blur` was introduced. Done: a repeat scan finds no v3-renamed utility left; no bare `ring`/`rounded`/`shadow`/`blur` was introduced.

## 4. Verification

- [x] 4.1 Run `npm run check`: tsc, eslint, 27 frontend tests, 141 backend tests and the production build. Done: ruff clean, 141 backend tests, 27 frontend tests, eslint 0 errors, production build ok.
- [x] 4.2 Push to `main`, confirm the CI run and Stage deploy succeed, and record the CSS bundle-size delta from the build output. Done: CI run #69 green - checks, build-images (docker frontend build with `@config`) and deploy-staging all passed. CSS delta: 81,155 -> 104,202 bytes raw, 14,865 -> 16,569 gzipped.
- [ ] 4.3 Verify on Stage that the shells, the equipment card, the registry and the task pages render unchanged and that a theme switch still restyles the app without a reload.

## 5. Docs

- [x] 5.1 Update `AGENTS.md` (frontend tooling notes: Tailwind v4 + Vite plugin, config kept via `@config`, the two restored preflight defaults) and record the prerequisite as done in the `shadcn-ui-pilot` design/tasks. Done: AGENTS.md carries the v4 tooling note (vite plugin, config via @config, the unlayered-vs-utility caveat, the restored preflight defaults and the renames) and the frontend row says Tailwind v4.
