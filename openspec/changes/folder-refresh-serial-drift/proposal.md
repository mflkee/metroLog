# Proposal

## Why

Folder refresh silently misses verifications that already exist in FGIS Arshin when the
instrument's serial number is spelled differently in the new verification record than in the
current one. Stage 2 of the matcher always sends `mi_number` (the serial exactly as Arshin wrote
it in the *current* record), and Arshin's `mi_number` filter is an exact string match, so every
attempt returns zero records: the row is reported as `UNCHANGED` with "Новая запись не найдена,
сохранена текущая версия свидетельства" — and the instrument keeps an expired certificate until
somebody re-onboards it by hand.

This is not hypothetical. On 2026-10-16 production showed verified instances where a new
verification existed in Arshin but refresh never offered it:

| Equipment | Current serial in Arshin | Serial in the new record | Missed verification |
|-----------|--------------------------|--------------------------|---------------------|
| СИКН 1520, Счетчики-расходомеры | `21202377-19011936` | `21202377 - 19011936` | С-АС/15-07-2026/541666007 (to 14.07.2030) |
| СИКН 1520, Счетчики-расходомеры | `21192723-19011902` | `21192723 - 19011902` | С-АС/16-09-2026/559147929 |
| ГПН «Хантос», Весы | `C133358228` (Latin C) | `С133358228` (Cyrillic С) | С-ВЯ/06-08-2026/549941871 (current one expired 06.02.2024) |
| СИКН 1520, Весы лабораторные | `418007` | `L418007` | С-АС/15-07-2026/541666004 |

## What Changes

- Add a **serial-tolerant fallback** to stage 2: when no record matches the current serial, repeat
  the instrument-parameter lookup **without** `mi_number` and validate the returned records locally
  against the current serial instead of trusting the query filter.
- Keep the serial-scoped attempts first and authoritative: when the serial matches, behaviour is
  unchanged (no relaxation, no review flag).
- Define serial compatibility in three tiers: equal after normalization (case, spaces, punctuation)
  and equal after homoglyph folding (Latin/Cyrillic look-alikes such as `C`/`С`) are accepted as the
  same instrument; equality of the **digits only** (for example `L418007` vs `418007`) is accepted
  but marked as needing review.
- Report the drift in the row note ("номер в Аршине записан иначе: … вместо …") and report
  ambiguity when several candidates match by digits only, so the reviewer sees why the row is
  flagged.
- Apply the same fallback to ESI matching (SI and ESI share the stage-2 resolver).
- Re-scan the affected folders after release so the already-missed verifications can be reviewed and
  applied.

## Capabilities

### New Capabilities
- `equipment-folder-refresh`: how a folder rescan matches each instrument (and ESI module) against
  FGIS Arshin, how an accepted match is classified as confident or requiring review, and what the
  review row reports about the match.

### Modified Capabilities
<!-- None: `service-version-identity` is unrelated to matching. -->

## Impact

- **Backend**: `app/services/folder_refresh_matcher.py` (stage-2 attempts, serial compatibility,
  match result flags and notes) and `app/services/equipment_folder_refresh.py` (row mapping of the
  new flags). No API shape change: the row already carries `uncertain_update`, `status` and `notes`.
- **Database**: no migration. The new diagnostics ride on existing columns
  (`equipment_folder_refresh_rows.notes`, `uncertain_update`, `stage2_successful`).
- **Frontend**: no change required — `UPDATED_UNCERTAIN` renders as "Обновить?" and the row note is
  already shown in the review table. A better label for the reason is optional polish, not part of
  this change.
- **Tests**: `backend/tests/test_folder_refresh_matcher.py` gains cases for each drift class;
  `backend/tests/test_equipment.py` covers the row mapping.
- **Ops**: after deploy, re-run folder refresh for СИКН 1520 and ГПН «Хантос» and review the rows the
  fix now finds (Stage first, then production).
