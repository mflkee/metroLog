# Design

## Context

See proposal.md - Why. Current sizes that define the targets:

- `backend/app/services/equipment_service.py` - 10,377 lines, one service class holding
  registry, processes, comments, attachments, exports and folder refresh.
- `frontend/src/pages/EquipmentDetailsPage.tsx` - 6,144 lines, `EquipmentPage.tsx` -
  4,567, `RepairsPage.tsx` - 4,011, `VerificationPage.tsx` - 3,735.
- `frontend/src/api/equipment.ts` - 4,244 lines covering every equipment domain.
- `openspec/changes/audit-and-fix` is expected to have landed first, so the extracted code
  already carries its regression tests.
- Verification happens on Stage through CI; `scripts/check.sh` runs backend lint and
  tests, frontend lint, tests and build.

## Goals / Non-Goals

**Goals:**

- Every hotspot file is reduced to a size a reviewer can hold in mind (target: no file
  above ~2.5k lines, achieved incrementally).
- The public facade stays stable, so callers and HTTP contracts do not change.
- Duplicated repair and verification frontend logic exists once.

**Non-Goals:**

- Changing behavior, fixing defects, or altering APIs (those belong to `audit-and-fix`).
- Adopting a component library (that is `shadcn-ui-pilot`).
- Reaching an arbitrary line count everywhere; extraction stops where the remaining code
  is cohesive.

## Decisions

**Keep the existing service as a facade.** New domain services are introduced, and the
existing public methods delegate to them with unchanged signatures. Rationale: callers in
routes, tasks and the sibling task service stay untouched, so a mistake shows up as a test
failure rather than a broken contract. Alternative: change all call sites at once -
rejected because it couples a large mechanical diff with real logic moves.

**Use mixins, not delegating services, for the first extraction (decided during
implementation).** Each extracted group becomes a mixin module (`EquipmentXxxMixin`) that
`EquipmentService` inherits. Rationale: `EquipmentService` shares cross-cutting helpers
(`_assert_folder_access`, `_get_folder`, `_record_equipment_event`,
`_commit_and_flush_process_notifications`, `_enrich_equipment_processes`) across every domain,
so delegating services would additionally require a shared repository/helpers base class and a
much larger diff. With mixins, `self.*` calls keep resolving through the MRO, no signature or
call site changes, and a single module move is verifiable by the existing 141 tests.
Alternative: delegating domain services as originally planned - deferred until the boundaries
are stable.

**Extract process templates and deadline presets first, not folders (decided during
implementation).** Measured with a dependency scan of the 180 methods: the folder/group methods
reference eight module-level helpers, two of which (`_build_deadline_preset_snapshot`,
`_get_latest_completed_stage_label`) drag in the whole stage-template subsystem - 43
module-level names, roughly 900 lines, including the 165-line
`_normalize_process_template_variants`. A mixin only needs the module-level helpers its own
methods call (`self.*` calls resolve through the MRO), so the coherent first move is that
subsystem itself into `equipment_process_templates.py`; folders and groups become a 8-name
import afterwards. Rationale: with the subsystem in its own module, every later extraction
(folders, comments, processes) stops dragging template code along.

**One domain per pull request.** Each extraction moves a single cohesive group and leaves
`npm run check` green. Rationale: a partial split is always shippable, and a regression is
attributable to one move.

**Frontend: extract the shared process core first.** `RepairsPage` and `VerificationPage`
mirror each other, so a common core removes duplication and shrinks both at once.
Rationale: highest ratio of removed lines to risk. Alternative: start with the largest page
- rejected because it duplicates work that the shared core makes unnecessary.

**Split the API client along domain boundaries already present in the file.** Rationale:
the module is an aggregation of independent domains, so the split is mechanical and easy
to verify by import errors alone.

**Extract by moving code, not by rewriting it.** Where the audit found a defect, it was
fixed in `audit-and-fix`; this change does not touch behavior. Rationale: keeps the diff
reviewable and the risk near zero.

## Risks / Trade-offs

- [Extraction breaks an import or a facade signature] -> tests and `tsc` fail immediately;
  extract in small PRs so the cause is obvious.
- [A move hides an accidental behavior change] -> no logic edits during a move; any needed
  change is split into a separate pull request.
- [Refactoring overlaps the UI pilot on the same pages] -> this change lands first, and the
  pilot starts from the extracted structure.
