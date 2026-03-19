# Development Buffer

## Purpose
Short working buffer for the current state of the project.

## Current Phase
Phase 2 - Equipment Registry Foundation

## Current Status
Repository cleanup and stabilization before the next Stage 2 iteration.

## Completed
- Stage 1 internal auth is working: bootstrap admin, admin-created users, temporary passwords, forced password change, profile metadata, and admin user-detail pages.
- Stage 2 registry foundation is present: folders, groups, equipment registry, equipment details, edit/delete flows, and basic filtering/search.
- Folder color functionality was removed from the product and from the active UI.
- Folder list now uses compact cards plus a search field instead of color coding.
- Unused local font assets and old font-variant styling were removed from the active frontend.
- Dead runtime leftovers from the abandoned email/auth-code flow were removed from backend code.
- Root docs and setup flow were aligned around local development first, Docker second.
- Deploy/check scripts were added under `scripts/`.

## Current Scripts
- `scripts/check.sh`
- `scripts/local/setup.sh`
- `scripts/local/backend.sh`
- `scripts/local/frontend.sh`
- `scripts/docker/deploy.sh`
- `scripts/docker/smoke.sh`

## Next
- Run the full verification pass after cleanup.
- Apply the cleanup migration that removes the legacy folder color column.
- Rebuild Docker and smoke-test the stack.
- Commit and push the cleanup baseline.
- Start the next Stage 2 iteration on equipment registry refinement.
