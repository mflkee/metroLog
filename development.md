# Development Buffer

## Purpose
This file is the working buffer for Codex-driven development.
It should stay short and reflect only the current task state.

## Current Phase
Phase 0 - Project Foundation

## Current Iteration
Stage 0 foundation completed: project skeleton and infrastructure are in place.

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

## Next
- Stage 1: minimal auth and roles foundation.
- Add backend user model, role enum, and initial auth routes.
- Add frontend auth state and connect login/register/profile pages to the backend contract.
- Add administrator-only user management page and backend rights-assignment endpoints.
- Keep permission model simple: `ADMINISTRATOR`, `MKAIR`, `CUSTOMER`.
- Revisit Docker startup when Docker is available in the environment.

## Working Rule
Update this file at the end of each iteration with:
- current task,
- brief completed items,
- immediate next steps.
