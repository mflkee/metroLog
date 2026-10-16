# Tasks

## 1. Serial compatibility rules

- [x] 1.1 Add serial normalization and comparison helpers to `backend/app/services/folder_refresh_matcher.py` (case/space/punctuation folding, Latin–Cyrillic look-alike folding, digits-only equality) and unit-test them in `backend/tests/test_folder_refresh_matcher.py` — `uv run --directory backend pytest tests/test_folder_refresh_matcher.py -q` covers `21202377-19011936` vs `21202377 - 19011936` (equal), `C133358228` vs `С133358228` (equal), `418007` vs `L418007` (digit-only), `418007` vs `191919` (no match)
- [x] 1.2 Make the comparison reject a serial whose digit part is shorter than 4 digits, and verify with a test that `1` and `01` do not count as a match

## 2. Serial-tolerant stage-2 fallback

- [x] 2.1 Extend the attempt ladder in `_build_stage2_attempts`/`_resolve_latest_vri_candidate` with the `mi_number`-free attempts from design.md (modification + year, modification only, registry number + title only), keeping today's serial-scoped attempts first — verify with a test where the serial-scoped search returns nothing and only the fallback finds the new record
- [x] 2.2 Filter fallback results locally with the compatibility rules from group 1, keep the existing "not earlier than the current verification" rule, and rank candidates by class before recency — verify with a test where a digits-only candidate from a foreign instrument is newer than the confident one and the confident one still wins
- [x] 2.3 Report the match class on `FolderRefreshMatchResult` (`serial_relaxed`, `serial_requires_review`, `serial_candidates`) and verify with tests that a normalized-equal match leaves `uncertain_update` false while a digits-only match sets it true and counts the candidates
- [x] 2.4 Cover the ESI path with a test that a module whose new record spells the serial differently is matched by the same rules (`match_esi` with the fallback)

## 3. Row mapping and reviewer-facing diagnostics

- [x] 3.1 Keep the row's status driven by the matcher's `uncertain_update` (which now folds the digits-only review in) so a digits-only match becomes `UPDATED_UNCERTAIN`, a confident match stays `UPDATED`, and `stage2_successful`/`notes` describe the serial drift with both spellings — verify with a test in `backend/tests/test_equipment.py` asserting the status and the note text for both classes
- [x] 3.2 Extend the matcher note (`_build_match_note`) so the ambiguity case states that several records match the serial, and verify with a test that the note mentions the count
- [x] 3.3 Document the serial-drift rule and the review requirement in `AGENTS.md` (Arshin integration / folder refresh section) and verify the text names the fallback and the digits-only review rule

## 4. Integration check on Stage

- [ ] 4.1 Merge to `main` and confirm the CI checks plus the Stage deploy succeed (`npm run check` locally first, then `deploy-staging` green and `/api/v1/health/ready` ready on port 9000)
- [ ] 4.2 Re-run folder refresh for **СИКН 1520** on Stage and verify on the server (`docker compose -p metrolog-stg -f docker-compose.staging.yml exec postgres psql … equipment_folder_refresh_rows`) that the four Счетчики-расходомеры rows now offer С-АС/15-07-2026/541666007, С-АС/16-09-2026/559147929, /559147928, /541666006 instead of «Без изменений»
- [ ] 4.3 Re-run folder refresh for **ГПН «Хантос»** on Stage and verify that the Весы row for `C133358228`/`С133358228` is offered for review with a note naming both spellings

## Workflow follow-up

- Release per the project rules: bump `version` in both `package.json` files, add the user-facing `CHANGELOG.md` entry, commit `chore(release): vX.Y.Z` with an annotated tag, push `main:release/X.Y.Z`.
- After the production deploy, re-run folder refresh for СИКН 1520 and ГПН «Хантос» and walk the newly found rows through the review table with the owner.
- Archive this change once the review above is done and the spec has been synced.
