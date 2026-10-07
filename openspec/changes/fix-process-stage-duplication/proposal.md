# Proposal

## Why

When a repair or verification is created from a folder deadline preset, the
process "Этапы и даты" list shows every stage twice: once as a non-deletable
template stage and once as a deletable custom stage. Users must delete the
duplicates by hand on every new process, which is error-prone and makes the
stage list untrustworthy.

## What Changes

- **Fix** process stage rendering so a newly created repair or verification
  shows each stage of the selected template variant exactly once.
- **Fix** custom stages so they start empty on creation and contain only
  user-added entries, instead of being seeded from the variant's stages.
- Keep user-added custom stages (add, reorder, date, delete) working exactly as
  before.
- Add regression coverage for the seeded-duplication case for both repairs and
  verifications, including variants with more stages than the standard key set.

## Capabilities

### New Capabilities
- `process-stage-templates`: the contract for how a repair's or verification's
  stage list is composed from a template variant and user-added custom stages.

### Modified Capabilities
<!-- None: no existing capability requirements change. -->

## Impact

- **Backend**: `_build_process_custom_stages_from_variant`,
  `_build_stage_template_from_process_variant` and their callers in
  `app/services/equipment_service.py` (repair creation, verification creation
  and batch creation). No schema change.
- **Frontend**: `VerificationPage.tsx` / `RepairsPage.tsx` stage row builders
  only if the backend contract change requires it; expected to need no change.
- **Data**: existing processes already have seeded duplicate custom stages in
  `custom_stages_json`; the change defines how those are handled.
