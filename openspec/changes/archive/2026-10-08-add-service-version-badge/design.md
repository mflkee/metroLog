# Design

## Context

See `proposal.md` — Why. Facts that shape the approach:

- `frontend/package.json` already carries `"version": "0.1.0"`; the repository
  root `package.json` also says `0.1.0`. The backend exposes no version endpoint;
  `settings.app_name` is just `"metroLog API"`.
- Vite and Vitest use **separate** configs (`vite.config.ts`, `vitest.config.ts`),
  so any build-time injection must be present in both.
- The topbar (`src/components/layout/Topbar.tsx`) already renders the product
  name `metroLog` and the Arshin status, which is the natural place for the
  version.

## Goals / Non-Goals

**Goals:**

- One source of truth for the displayed version.
- Zero network dependency; the value is baked into the bundle.
- A visible `beta` marker while the service is pre-`1.0.0`.

**Non-Goals:**

- A backend `/version` endpoint or runtime version negotiation.
- Automatic version bumping per commit (release-time bumping is enough).
- Per-component or per-build-number display.

## Decisions

### D1: Single source of truth is `frontend/package.json`

The version is read from `frontend/package.json` at build time. *Alternative:* a
`VERSION` file or a hardcoded constant — both drift from the package metadata the
registry/pipeline already uses.

### D2: Inject at build time with Vite `define`

Both `vite.config.ts` and `vitest.config.ts` set
`define: { __APP_VERSION__: JSON.stringify(version) }`, reading the version from
`package.json`. `src/vite-env.d.ts` declares `const __APP_VERSION__: string`. The
app reads it through a tiny `src/lib/appVersion.ts` module that also defines the
`APP_STAGE = "beta"` label. *Alternative:* `import ... from "package.json"` in app
code — pulls the whole manifest into the bundle and beyond `src` rootDir.

### D3: Static beta label, semver-ish version

The version follows **Semantic Versioning**: `MAJOR.MINOR.PATCH`. While the
service is below `1.0.0` it is in initial development: anything may change, and
the `beta` channel marker is shown as a separate label rather than inside the
version string.

Bump policy for this project:

- `PATCH` (`0.1.0` → `0.1.1`): bug fixes and internal-only changes.
- `MINOR` (`0.1.0` → `0.2.0`): new user-visible capabilities (e.g. the task
  module), and — pre-`1.0.0` — breaking changes too.
- `MAJOR` (`1.0.0`): first stable, breaking-change-stable release.

The version is bumped as part of promoting a build (Stage → Prod), not on every
commit, and tagged in git (`v0.1.0`). A `CHANGELOG.md` (Keep a Changelog) fed by
conventional commits is a reasonable follow-up but out of scope here.

*Alternative:* pre-release identifiers (`0.1.0-beta.1`). Rejected for now — the
whole service is beta, so a persistent channel label reads better than a
per-build suffix; it can be adopted at `1.0.0`.

### D4: Render next to the product name in the topbar

A dedicated `AppVersionBadge` component renders `v{version}` and the `beta` tag,
with a `title` of `metroLog {version} ({stage})`. Keeping it a small component
makes it unit-testable in isolation.

## Risks / Trade-offs

- [Version must be kept in step between root and frontend `package.json`] → the
  displayed value comes only from `frontend/package.json`; treat it as the single
  source and align the root package when releasing.
- [Two Vite configs must both inject the constant, or tests see `undefined`] →
  add the define to both and cover it with a component test.
- [A hardcoded `beta` label could outlive the beta] → gate or flip it when the
  version reaches `1.0.0`; documented in the change.

## Migration Plan

1. Inject the version constant in both Vite configs and declare its type.
2. Add `appVersion` and `AppVersionBadge`, render it in the topbar, add a test.
3. Ship via the normal `main` → Stage, then `release/*`/`promote.yml` flow.
4. Rollback: revert the image; nothing else depends on the constant.

## Open Questions

- Should the badge also appear on the login page and in exported documents?
  Deferrable; the header is the required baseline.
