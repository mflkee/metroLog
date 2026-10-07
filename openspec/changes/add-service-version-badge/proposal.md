# Proposal

## Why

metroLog is an internal beta, but nothing in the running web app says which
build a user is looking at. Support and operators cannot tell a screenshot from
an old build apart from the current one, and there is no single place that
states the current service version.

## What Changes

- Show the metroLog **version** and a **beta** marker statically in the app
  header, next to the product name.
- Source the version from a single place (`frontend/package.json`) and inject it
  at build time, so the displayed value always matches the shipped build.
- Establish the project's versioning convention: semantic versioning, currently
  `0.1.0`, with a documented bump policy.

## Capabilities

### New Capabilities
- `service-version-identity`: how the running web app advertises its version and
  release channel.

### Modified Capabilities
<!-- None: no existing capability requirements change. -->

## Impact

- **Frontend**: `vite.config.ts` and `vitest.config.ts` (inject the version),
  `src/vite-env.d.ts` (declare the injected constant), a small
  `AppVersionBadge` component, and the topbar.
- **Docs**: versioning convention noted in the repo so the bump policy is not
  tribal knowledge.
- No backend or database changes.
