# Findings

Severity: `MAJOR` (correctness/security/data), `MINOR` (robustness/performance), `INFO`.

## Baseline (task 1)

Recorded on 2026-10-08, `main` at `b131669`, local `archlinux-notebook`.

| Metric | Value | Command |
|---|---|---|
| Backend lint (ruff) | clean - "All checks passed!" | `npm run lint:backend` |
| Backend tests | 139 passed, 3 warnings | `npm run test:backend` |
| Backend coverage | **82%** (9,653 statements, 1,740 missed) | `npm run test:backend` |
| Backend mypy | **81 errors in 8 files** (56 source files checked) | `uv run --directory backend mypy app` |
| Frontend lint (eslint) | clean | `npm run lint:frontend` |
| Frontend tests | 10 passed / 6 files (all `src/lib/*`) | `npm run test:frontend` |
| Frontend coverage | **1.84%** statements, 44.82% branches, 15.6% functions | `npm run test:frontend -- --run --coverage` |
| Frontend build | ok, `vendor` 322.61 kB (gzip 102.14 kB) | `npm run build:frontend` |

## Findings

### F-001 (MINOR) - The pipeline never runs tests

`ci.yml` builds images and deploys, but runs neither `pytest` nor `vitest`. Tests
execute only through `npm run check` on a developer machine, and pre-commit runs only
`ruff` and `eslint`. A change that breaks tests still ships.

- Evidence: `.github/workflows/ci.yml` contains no test invocation.
- Owner: audit-and-fix (tooling baseline, tasks 1.2/1.4) plus a CI job.

### F-002 (MINOR) - Mypy reports 81 errors that were never triaged

Mypy is configured in `backend/pyproject.toml` but is not part of `check.sh` or CI, so 81
real errors accumulated unnoticed. Representative examples:

- `app/api/v1/routes/equipment.py:307` - `_persist_upload_to_temp_file` receives
  `starlette...UploadFile | str` where `fastapi...UploadFile` is expected.
- `app/api/v1/routes/equipment.py:314-315` - multipart form fields forwarded with
  `UploadFile | str` types into a request schema expecting `str`/`bool`.

These are type-level symptoms of the multipart handling in `routes/equipment.py`, which is
also on the access-control and validation review lists.

- Owner: audit-and-fix, tasks 2/3 (fix as files are touched), and the tooling baseline.

### F-003 (MINOR) - Frontend coverage is effectively zero

Frontend tests cover only `src/lib/*`; the statement baseline is 1.84% (589/31,914).
Every page, api module and store is untested, so frontend state defects cannot be caught
by the pipeline.

- Owner: audit-and-fix (task 5) for the audited areas; broader coverage is follow-up work.
