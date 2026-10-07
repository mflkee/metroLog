# Design

## Context

See `proposal.md` — Why. The stage list of a repair/verification is assembled
from three pieces:

- `_build_stage_template_from_process_variant(variant, ...)`
  (`app/services/equipment_service.py` ~8392) — builds `stage_template` from
  **all** `variant["stages"]`.
- `_build_process_custom_stages_from_variant(variant, anchor_key=...)` (~8420) —
  builds `custom_stages_json` from the variant meta marker **plus
  `variant["stages"][1:]`**, each anchored at the process start key
  (`sent_to_verification_at` / `sent_to_repair_at`).
- The frontend row builders (`buildVerificationStageRows` in
  `VerificationPage.tsx` ~3314, and the equivalent in `RepairsPage.tsx`) render
  every template stage and interleave custom stages after their anchor.

Because a variant's stages map positionally to the standard milestone keys
(`_apply_standard_stage_keys`), the template already renders them. Seeding the
same stages as custom stages makes stages 1..n appear twice; the second copy has
a non-null `customStageId`, which is why the UI shows it with a delete action.

### Reproduction (no database required)

```
backend/.venv/bin/python: build _build_default_verification_stage_template_variants(),
select the "offsite_with_demolition" variant, then call both builders.
Result: stage_template = 7 labels, custom_stages = the same 6 labels
(stages[1:]) -> 13 rendered rows, 6 duplicated labels.
```

This affects repairs and verifications equally, since both call the same helper.

## Goals / Non-Goals

**Goals:**

- A newly created process shows each variant stage exactly once.
- Preserve the roles of the two sources: standard milestone stages stay
  template stages; extra stages stay user-editable custom stages.
- Repair existing rows that already contain seeded duplicates.

**Non-Goals:**

- Redesigning the preset editor or the meaning of standard milestone keys.
- Changing how user-added custom stages are stored or validated.
- Any database schema change.

## Decisions

### D1: Split the variant stages by the standard key count

The boundary between template and custom stages is the number of standard
milestone keys for the process flow, not `1`:

- verification: `len(VERIFICATION_STANDARD_STAGE_KEYS_BY_FLOW_MODE[flow_mode])`
- repair: `len(REPAIR_STANDARD_STAGE_KEYS_BY_ROUTE_KIND[route_kind])`

Template stages = `variant["stages"][:std]`; seeded custom stages =
`variant["stages"][std:]`. For a default preset (count == standard) this yields
an empty custom list — the reported duplication disappears — while a preset with
extra stages keeps rendering those extra stages as editable custom stages, once.

*Alternative A:* make `_build_process_custom_stages_from_variant` return only
the meta marker. Simplest, but it would drop preset extra stages from the
editable custom list and leave them as non-editable template rows.
*Alternative B:* deduplicate in the frontend by label. Rejected — the backend
would keep storing contradictory data and the archive view (which reads only
`stage_template`) would still disagree with the active view.

### D2: Keep the meta marker

The `{kind: "preset_variant", template_variant_id: ...}` marker MUST remain the
first entry of `custom_stages_json`; it is how `_extract_process_template_variant_id`
recovers the chosen variant when reattaching the template on read and update.

### D3: Clean up legacy seeded duplicates

Previously seeded custom stages are identifiable by their id prefix
`preset_` (user-added ids start with `cs-`/`cs_`). Remove custom stages whose id
starts with `preset_` from existing `repairs.custom_stages_json` and
`verifications.custom_stages_json`, preserving the meta marker and any
user-added stages and their dates.

*Alternative:* deduplicate on read. Rejected — it leaves bad data in place and
the cleanup is a bounded, one-time operation.

## Risks / Trade-offs

- [A preset relies on extra stages appearing as template rows with milestone
  keys] → unlikely, since only standard keys have form fields; verify against
  the current preset data before rollout and keep the standard-key boundary as
  the single source of truth.
- [Legacy cleanup removes a legitimate stage whose id happens to start with
  `preset_`] → scan production `custom_stages_json` first and assert the count of
  `preset_` entries equals the expected seeded duplicates before deleting.
- [Repairs and verifications diverge because their key maps differ] → drive both
  from the shared helper and cover each flow mode in tests.
- [Change touches a large file] → keep the diff to the helper functions and add
  focused tests; no service or route signature changes.

## Migration Plan

1. Fix the two helpers so template and seeded-custom stages partition the variant
   stages by the standard key count.
2. Ship a one-off cleanup (Alembic data migration or management command) that
   strips `preset_`-prefixed custom stages from existing repairs and
   verifications, then verify counts on Stage before Prod.
3. Deploy via the normal `main` → Stage, then `release/*`/`promote.yml` flow.
4. Rollback: revert the image; the cleanup is data-destructive only for the
   seeded duplicates, so take the standard `pg_dump` backup (already part of the
   deploy pipeline) before it runs.

## Open Questions

- Should the cleanup run as an Alembic data migration (automatic on startup) or
  as a manually triggered command, given it rewrites existing rows? Deferrable,
  but must be decided before implementation because it changes the task list.
