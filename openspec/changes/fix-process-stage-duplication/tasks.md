# Tasks

## 1. Fix stage partitioning in the backend

- [x] 1.1 Add a helper that resolves the standard milestone key count for a variant (from `VERIFICATION_STANDARD_STAGE_KEYS_BY_FLOW_MODE` for verification flows and `REPAIR_STANDARD_STAGE_KEYS_BY_ROUTE_KIND` for repair routes) and unit-test it for all three verification flow modes and both repair route kinds.
- [x] 1.2 Change `_build_process_custom_stages_from_variant` to seed custom stages from `variant["stages"][standard_count:]` instead of `stages[1:]`, keeping the `preset_variant` meta marker first; verify with a unit test that the default offsite preset produces an empty custom list.
- [x] 1.3 Change `_build_stage_template_from_process_variant` to expose only the standard stages (`variant["stages"][:standard_count]`) as template rows; verify with a unit test that template + seeded custom rows together equal the variant stage count with no label repeated.
- [x] 1.4 Add a regression test creating a verification and a repair from a standard preset and asserting the number of rendered rows equals the number of variant stages (guards the reported bug); verify it fails on the pre-fix code and passes after.
- [x] 1.5 Add a test for a preset variant that defines one extra stage beyond the standard keys, asserting the extra stage appears exactly once as a custom stage and not as a template row.

## 2. Clean up legacy seeded duplicates

- [ ] 2.1 Decide and implement the cleanup mechanism (Alembic data migration or management command) that removes custom stages whose id starts with `preset_` from `repairs.custom_stages_json` and `verifications.custom_stages_json`, preserving the meta marker and all other stages; verify on a seeded Stage copy that row counts drop by the expected number.
- [x] 2.2 Add a test with a legacy payload containing a `preset_` duplicate and a user-added stage, asserting the duplicate is removed, the user stage and its date survive, and the meta marker is retained.
- [x] 2.3 Verify the cleanup is idempotent (a second run is a no-op) and document the command/migration and its rollback in the change notes.

## 3. Frontend alignment

- [x] 3.1 Verify the frontend row builders already render the corrected backend contract without change; if a row builder duplicates a stage for any flow mode, fix it and cover with a component test.
- [ ] 3.2 Confirm the archive view (`stageTemplate.slice(1)`) and the active card agree on the stage list for offsite and on-site presets; verify with a component test asserting equal stage labels in both views.

## 4. Integration checks

- [x] 4.1 Run `npm run check` and fix any failures.
- [x] 4.2 On Stage, create a test SI, run a verification with the "С отправкой" and an on-site preset, and confirm each stage appears once with no deletable duplicate.
- [x] 4.3 Confirm an existing pre-fix verification (if present on Stage) shows a single clean stage list after the cleanup, with user-added custom stages and dates intact.
