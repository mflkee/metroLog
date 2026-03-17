# Development Buffer

## Purpose
This file is the working buffer for Codex-driven development.
It should stay short and reflect only the current task state.

## Current Phase
Phase 0 - Project Foundation

## Current Iteration
Stabilize the main specification files before implementation starts.

## Status
In progress

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

## Next
- Keep refining `codex.md`, `backend/codex.md`, `frontend/codex.md`, and `development.md`.
- Clarify stack and functional expectations from the user before scaffolding begins.
- Keep extracting requirements from the MVP workbook where useful.
- Keep repairs deliberately under-specified until that area is discussed separately.
- Keep only the agreed repair list behavior for now: active/archive plus search/filter.
- Keep the dashboard concept minimalistic and operational, not marketing-oriented.
- Keep the initial permission model simple: `ADMINISTRATOR`, `MKAIR`, `CUSTOMER`.
- Start Phase 0 project scaffold for backend, frontend, and infrastructure after the specification stabilizes.

## Working Rule
Update this file at the end of each iteration with:
- current task,
- brief completed items,
- immediate next steps.
