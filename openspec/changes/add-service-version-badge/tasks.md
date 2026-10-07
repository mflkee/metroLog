# Tasks

## 1. Inject the version at build time

- [x] 1.1 Read the version from `frontend/package.json` in `vite.config.ts` and expose it as `define: { __APP_VERSION__ }`; verify `npm run build:frontend` succeeds.
- [x] 1.2 Mirror the same `define` in `vitest.config.ts`; verify `npm run test:frontend` still passes.
- [x] 1.3 Declare `const __APP_VERSION__: string` in `src/vite-env.d.ts` and add `src/lib/appVersion.ts` exporting `APP_VERSION` and `APP_STAGE = "beta"`; verify `npm run build:frontend` type-checks.

## 2. Badge component and header

- [x] 2.1 Add `AppVersionBadge` rendering `v{version}` and the beta tag with an explanatory `title`; verify with a component test that it shows a `vX.Y.Z` string and `beta`.
- [x] 2.2 Render `AppVersionBadge` in `Topbar.tsx` next to the product name; verify the topbar shows the badge after login.
- [x] 2.3 Document the versioning convention (semver + bump policy) in the repo (e.g. a short "Versioning" section in the frontend README or the change notes); verify the policy is reachable from the repo root.

## 3. Integration checks

- [x] 3.1 Run `npm run check` (lint, tests, build) and fix failures.
- [x] 3.2 On Stage, confirm the header shows `v0.1.0` and `beta`, and that changing `frontend/package.json` and rebuilding changes the shown value.
