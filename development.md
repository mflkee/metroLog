# Development Buffer

## Purpose
This file is the working buffer for Codex-driven development.
It should stay short and reflect only the current task state.

## Current Phase
Phase 1 - Minimal Auth and Roles

## Current Iteration
Stage 1 refactored: internal admin-created users, temporary passwords, forced password change, and bootstrap admin are now implemented.

## Status
Completed

## Completed
- Added root project specification to `codex.md`.
- Added backend development specification to `backend/codex.md`.
- Added frontend development specification to `frontend/codex.md`.
- Reviewed sibling repositories `../metrologenerator`, `../search_docnum`, and `../metrologet` as local references.
- Added specification notes that these repositories may be consulted for proven backend patterns and Arshin integration ideas.
- Confirmed the MVP workbook reference file: `mvpexcel/uchet_oborudovaniya_demo_v2.xlsx`.
- Reviewed workbook sheet structure and aligned the spec with workbook-based functional areas.
- Added the navigation rule `1 page = 1 functional area`.
- Decided to keep the current four specification files and not add extra spec files for now.
- Reviewed `../metrologet` for folder/group hierarchy ideas.
- Reviewed `../search_docnum` for uncertain Arshin match handling and manual verification cues.
- Reviewed `../metrologenerator` as reference for extra Arshin detail fetch by `vri_id`.
- Added spec requirements for folder/group drill-down, SI manual review, equipment card notes, and audit-style event logging.
- Added requirement for active/archive repair views and search/filter behavior on all list pages.
- Added application shell requirement: persistent navigation frame across internal pages.
- Added simple auth and account expectations: login, registration, and profile pages should stay minimal.
- Parsed the Excalidraw draft in the root PDF and extracted the initial role/access model.
- Reworked equipment notes in the spec into note entries with mandatory author name and timestamp.
- Created Stage 0 backend skeleton with FastAPI app, config, DB session, Alembic setup, and health endpoints.
- Created Stage 0 frontend skeleton with Vite-style structure, shared AppShell, routes, and minimal auth/profile pages.
- Added Stage 0 theme switching in the shared shell: white, dark, gray, and blueberry themes with persisted selection.
- Refined Stage 0 theme switching into a dropdown selector and darkened the blueberry palette for clearer separation from the white theme.
- Tuned the custom palettes further: gray moved into a warmer `#a89984` direction, blueberry softened, and a new `old-book` theme was added.
- Added root project files: `.env.example`, `docker-compose.yml`, `.gitignore`, and `README.md`.
- Added backend and frontend package manifests plus base lint/test configuration.
- Verified backend static checks with `ruff check`.
- Verified backend smoke-tests with `pytest`.
- Installed frontend dependencies and verified `eslint`, `vitest`, and `vite build`.
- Added Stage 1 backend user model, role enum, password hashing, token handling, auth routes, admin user routes, and Alembic migration.
- Added backend tests for registration, login/me, admin role updates, access restrictions, and last-admin protection.
- Added frontend auth API layer, persisted auth store, session bootstrap, protected routes, and admin-only user management page.
- Connected login, registration, profile, navigation visibility, and logout behavior to the real backend auth contract.
- Verified backend checks with `ruff check` and full `pytest`.
- Verified frontend checks with `eslint`, `vitest`, and `vite build`.
- Added spec requirements for password confirmation, profile password change, and future email-based verification/reset flows.
- Added confirm-password validation on registration, blocked clipboard actions on password fields, and password change from the profile page.
- Added backend password-change endpoint and tests for successful password update plus invalid current password.
- Added email-verification and password-reset code flow with backend tokens, guest pages, and console/SMTP delivery modes.
- Added new auth pages: verify email, forgot password, and reset password.
- Updated Docker/env setup so containers read `.env` and can be configured for SMTP delivery.
- Tightened Docker startup so images install dependencies at build time and containers boot directly into migrations and app startup.
- Fixed Alembic revision id length so PostgreSQL can update `alembic_version` during Stage 1 migrations.
- Switched frontend API access to same-origin `/api/v1` with Vite proxy support for Docker and public-domain access.
- Added explicit password policy enforcement: minimum 6 characters, with both letters and digits, on backend and frontend.
- Improved auth UX for network failures and preserved registration draft fields across reloads without storing passwords.
- Re-verified backend and frontend checks after the auth extension.
- Revised the product specification away from open self-registration and toward admin-created internal users with temporary passwords and first-login password change.
- Marked the existing email-registration implementation as transitional and no longer the target MVP auth behavior.
- Reworked the shared gray theme into a monochrome palette between the white and dark themes.
- Refactored backend auth to bootstrap an administrator, remove public registration flow, add `must_change_password`, and issue temporary passwords from admin actions.
- Refactored frontend auth and admin UI to remove public registration, create users from the admin page, reset passwords, and gate the shell on forced password change.
- Added bootstrap-admin env configuration and updated docs for the internal auth model.
- Re-verified backend tests and backend lint checks after the Stage 1 refactor.
- Re-verified frontend lint, test, and production build after the Stage 1 refactor.
- Removed temporary probe users from the live Docker database after Stage 1 verification, leaving only the intended bootstrap admin and current working user.
- Repointed the bootstrap administrator to `makeevgb@mkair.ru` and removed the temporary `admin@metrolog.local` record, leaving a single administrator account in the live Docker database.
- Stretched the Stage 1 shell layout to full viewport width so the sidebar/topbar frame no longer clips on the right when the browser zoom changes.
- Added editable profile fields in Stage 1 for phone, position, and facility, with self-service update through the authenticated profile page.
- Tightened the Stage 1 profile presentation into compact info cards and extended self-service profile data with `organization`.
- Added Stage 1 administrator access to individual user profile pages with phone, position, organization, and facility details.

## Next
- Keep permission model simple: `ADMINISTRATOR`, `MKAIR`, `CUSTOMER`.
- Prepare Stage 2: folders, groups, and equipment registry foundation.
- Revisit Docker startup when Docker is available in the environment.

## Working Rule
Update this file at the end of each iteration with:
- current task,
- brief completed items,
- immediate next steps.
