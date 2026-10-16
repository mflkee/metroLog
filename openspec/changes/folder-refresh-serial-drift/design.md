# Design

## Context

See `proposal.md` — Why for the incident and the missed instruments.

Matching runs in `app/services/folder_refresh_matcher.py`:

1. **Stage 1** looks up the *current* certificate number (`result_docnum` + `year`), which yields the
   record the equipment is currently on.
2. **Stage 2** searches by instrument parameters taken from that record — `mit_number`, `mit_title`,
   `mit_notation`, `mi_modification`, `mi_number` — and keeps records whose verification date is not
   earlier than the current one. `_build_stage2_attempts()` relaxes only `mi_modification` and
   `mit_notation`; `mi_number` is sent in **every** attempt.
3. `_map_vri_search_result()` maps the winning record into the row via
   `app/services/equipment_folder_refresh.py`, which stores status, `uncertain_update`,
   `stage2_successful` and `notes`.

Constraints measured against the live FGIS API while implementing this change:

- `mi_number` is an **exact** string match with no partial matching at all: `19011936` and
  `21202377` return zero records, `21202377-19011936` returns zero while `21202377 - 19011936`
  returns exactly one, and `C133358228` (Latin) returns zero while `С133358228` (Cyrillic) returns
  exactly one.
- Result sets are capped by `max_results` (`50` for stage 2, `100` per page) and pages are **not
  ordered by verification date**: for type `45115-16` (1254 records) page 1 spans 08.09.2026 →
  05.02.2026, page 2 spans 05.02.2026 → 01.10.2026 and page 3 spans 01.10.2026 → 29.09.2026. A
  target record may therefore sit anywhere in a heavy result set, so a "fetch the newest page and
  filter locally" strategy is a lottery rather than a mechanism.
- Instrument types are not a safe identity key on their own: within `58760-14` the serials `418007`,
  `L418007` and `Р418007` all exist as **different** instruments. A modification is more
  discriminating: `mit_number` + `mi_modification` for `58760-14` / `мод. ВЛЭ-6202CI` returns 3
  records, and for `63293-16` / `MS1602TS` returns 23.
- Spelling variants of a filter value are cheap and precise: querying the current serial with spaces
  around its separator, or with its letters folded to the other alphabet, returns exactly the
  drifted record (`count=1`).
- The review row already carries everything needed to surface a cautious match: `UPDATED_UNCERTAIN`
  renders as «Обновить?», `notes` is printed in the review table, and applying is driven by the rows
  the reviewer ticks.

## Goals / Non-Goals

**Goals:**

- Find verifications that exist in Arshin but are currently unreachable because the serial is
  spelled differently in the new record.
- Separate matches that are certain (the same written serial) from matches that need human review
  (only the digits coincide).
- No regression for instruments whose serial matches: same attempts, same result, no new flags.
- Ship as a backend-only deploy with no schema change.

**Non-Goals:**

- Instruments whose card has no registry number (`mit_number`) — a separate defect; the search has
  no usable anchor there.
- Instruments re-registered under a new type number (a new `mit_number` cannot be derived from the
  old one).
- Any change to the review UI or to the apply contract.
- Changing how stage 1 resolves the current record.

## Decisions

### Spelling variants as exact queries, and dropping `mi_number` only as the last resort

Variants of the *stored* value rescue the two drift classes that are structured rather than
arbitrary: whitespace around separators and look-alike letters across alphabets. Both are cheap
(`count=1` measured) and keep the query exact, so the result needs no review flag.

They cannot rescue a serial that gained a letter (`418007` → `L418007`): the new spelling is not
derivable from the old one. That class is why the ladder ends with serial-free queries and a local
serial check. *Alternatives considered:* sending 3-5 spelling variants of the serial only — rejected
as insufficient for the letter case; accepting the newest record of the type without a serial check
— rejected, most records returned for a popular type belong to other instruments.

### Two classes of acceptance: normalized equality vs digit equality

- **Confident** — equal after normalization (case, spaces, punctuation folded) *or* after folding
  Latin/Cyrillic look-alike letters, and the digit parts are equal. This is the same written serial,
  so it does not warn. Covers `21202377-19011936` / `21202377 - 19011936` and `C133358228` /
  `С133358228`.
- **Needs review** — only the digit parts are equal (`418007` / `L418007`). A leading letter can
  denote a different instrument, so the row must be ticked by a human before it is applied.

*Alternative considered:* accept digit-only silently — rejected; collisions are real and would
overwrite a certificate with another instrument's data.

### Attempt ladder: precise queries before the local-check fallback

Because `mi_number` knows no partial matching and heavy result sets cannot be paged reliably,
precision at the query level comes first and the local serial check is the last resort:

1. `mit_number` + `mit_title` + `mi_modification` + `mi_number` + `mi_notation` — today's attempt.
2. `mit_number` + `mit_title` + `mi_number` — today's relaxation.
3. Year-scoped variants of 1-2 (`target_year`) — today's fallback.
4. **New — serial spelling variants:** the same attempt as 1 with the serial rewritten as its
   spacing variants (spaces around separators, all spaces removed) and its homoglyph variants
   (letters folded to the other alphabet). Each is still an **exact** query, so a hit is
   unambiguous; variants are generated only when they differ from the stored value.
5. **New — modification-scoped without the serial:** `mit_number` + `mit_title` + `mi_modification`
   variants (± `target_year`), with the local serial check. The modification narrows the set to a
   handful of records (3 and 23 in the measured cases), which is why this level works where the
   type-wide query does not.
6. **New — last resort:** `mit_number` + `mit_title` (± `target_year`) with the local serial check.
   Kept last because ordering is unreliable and the set is heavy; it can still rescue a case where
   the modification drifted beyond spacing.

The local serial check runs on the records each serial-free attempt returns, and the existing
"not earlier than the current verification" filter still applies before any of them is accepted.
Attempts that find records **do not** short-circuit the ladder when nothing newer comes back: a
filter that answers for the old record proves nothing about the new one's spelling.

### Candidate ranking by precision, then recency

Candidates are grouped by the class above; the best class present wins, and within a class the
newest verification date wins (existing `_select_most_recent_record` ordering as the tie-break).
This keeps a confident match from being shadowed by a digits-only record of a foreign instrument.
When the winning class is "needs review", the result also reports how many candidates matched that
way, so the note can state the ambiguity.

### Diagnostics on the existing columns, no migration

The match result gains `serial_relaxed`, `serial_requires_review` and `serial_candidates`. The
service turns the review flag into the row's `uncertain_update` (already mapped to
`UPDATED_UNCERTAIN`), keeps `stage2_successful = true`, and the matcher's note names both spellings —
«Заводской номер в Аршине записан иначе: «21202377 - 19011936» вместо «21202377-19011936».» — plus
the ambiguity sentence when several candidates matched. Adding dedicated columns was rejected:
nothing consumes them yet, and a migration would turn a one-image deploy into a schema rollout.

## Risks / Trade-offs

- [Digit-only collision picks a foreign instrument] → such matches are never auto-applied; the row
  is `UPDATED_UNCERTAIN` and the reviewer ticks it; the note names the spellings.
- [Homoglyph folding is too permissive] → the fold covers only the standard Latin/Cyrillic
  look-alike set and additionally requires equal digit parts; a letter added or removed never folds,
  it stays in the review class.
- [Extra Arshin requests and possible 429s] → fallbacks run only when the serial-scoped attempts
  found nothing; variants are generated only when they differ from the stored value (a serial
  without separators or look-alike letters adds none); the client already retries 408/429/5xx with
  backoff, and the ladder keeps the exact queries first.
- [Assumption that Arshin returns records in a useful order] → measured false: pages are not sorted
  by verification date. The exact-query levels do not depend on ordering at all, and the serial-free
  levels narrow the set with the modification instead of paging a heavy type, so the ladder does not
  rely on where a record sits in a result set.
- [The ladder never short-circuits on "found but nothing newer"] → intentional: a filter that
  answers for the old spelling says nothing about the new one (in the `418007` case the serial-scoped
  attempts return nothing at all, while in other cases they may return the old record only). The
  price is a longer ladder for instruments that genuinely have no new verification.
- [Rows that used to read «Без изменений» start offering updates] → intended; the summary counters
  and the review table already show what will be applied and only ticked rows are applied.

## Migration Plan

1. Backend-only deploy (Stage first, then production) — no migration, no frontend change.
2. On Stage, re-run folder refresh for **СИКН 1520** and **ГПН «Хантос»** and confirm the five
   known-missed instruments are offered (four as regular updates, `2642` as a review row; `904` is
   already repaired by hand).
3. After production deploy, re-run the same folders and review the newly found rows with the owner.
4. Rollback: redeploy the previous image; refresh rows are read-only data, nothing to undo.
