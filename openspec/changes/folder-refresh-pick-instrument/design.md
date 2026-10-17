# Design

## Context

See `proposal.md` — Why.

What the code does today (as found in the repository, not assumed):

- `FolderRefreshMatcher._describe_serial_instruments` already probes Arshin by serial
  (`search_records(params={"mi_number": …})`) and collects the distinct `(mit_number, modification)`
  pairs it finds; the result is reduced to strings like `303-91 Термометры ртутные стеклянные
  лабораторные` and handed to `_build_match_note`, which joins them into one sentence.
- `EquipmentFolderRefreshRow` stores exactly one matched record (`matched_*` fields plus
  `matched_payload_json`, the Arshin detail the apply writes) and a free-text `notes`.
- `apply_folder_refresh_rows` (sync) applies `row.matched_payload_json`; it does not re-check the
  freshness of that record — the rule "a candidate is never older than the current verification" is
  enforced by the matcher while scanning.
- The review table on the equipment registry page renders `row.notes` in a cell and applies rows by
  id; there is no per-row choice anywhere in the flow.

## Goals / Non-Goals

Goals:

- The ambiguity the matcher already detected becomes a decision the operator can actually make in
  the review table, and the decision is what gets written.
- The note stays readable no matter how many instruments share a serial.

Non-Goals:

- Changing which candidate the matcher picks by default, or the rules that decide it.
- Turning the review row into a general Arshin search (see Open Questions).
- Giving the operator a way to say "this certificate is not ours at all" — removing a foreign
  verification stays the existing manual flow (comment plus «поверка не найдена»).
- Re-scanning history: rows produced before this change keep their current shape.

## Decisions

### Candidates are stored on the row, not re-queried later

The probe that detects the ambiguity is the only place that knows the serial spellings and filters
used, so the records it found are persisted as candidates on the row (`candidates_json`: `vri_id`,
`mit_number`, `mit_title`, `mi_modification`, `mi_number`, `certificate_number`, `org_title`,
`verification_date`, `valid_date`, `arshin_url`). A new `serial_ambiguous` flag is stored next to
them, so the apply guard does not have to re-derive the ambiguity from the note text.

The laboratory (`org_title`) is the field that actually settles the question: an object is verified
by one laboratory, so a newer record issued by another one belongs to a same-serial stranger. In
production the type dump hid exactly that — the operator could see that dozens of types share
`841` but not that the offered certificate came from Термоприбор while their own came from the
Якутский ЦСМ.

Alternative rejected: re-running the probe when the operator opens the picker — it doubles Arshin
traffic for the same data and can return a different set than the row's note describes.

### Picking a candidate fetches its Arshin detail once

`POST /equipment/folders/{folder_id}/refresh-tasks/{task_id}/rows/{row_id}/candidate` with
`{"vri_id": …}` (async route) fetches that record's detail from Arshin and writes it into the row's
`matched_*` fields and `matched_payload_json`, and records `picked_candidate_vri_id`. The apply then
stays sync and unchanged in shape: it writes what the row holds.

Alternative rejected: fetching details for every candidate during the scan — an ambiguous row can
carry dozens of candidates, so that is dozens of Arshin calls for a row nobody may touch.
Alternative rejected: passing the pick inside the apply request — the table must show what will be
written, and the choice must survive a reload.

### The apply refuses two things a picked candidate can bring

`_apply_folder_refresh_row` gains two guards, both reported per row like the existing ones:

- a row flagged `serial_ambiguous` with no picked candidate is not applied, and the message asks to
  choose the instrument whose certificate it is;
- a picked candidate whose verification date is earlier than the row's current verification is not
  applied, with a message that a verification not older than the current one is required. This keeps
  the freshness rule true even though the pick happens after the scan.

### The note names the count, the picker carries the list

`_build_match_note` keeps its other sentences but replaces the type dump with
«Заводской номер в Аршине есть у N приборов — выберите нужный». The candidates are ordered by
verification date (newest first) and capped at the probe limit; the note carries the true count, so
a capped list never looks exhaustive when it is not.

### The picker is our own dialog with our own list

The review cell shows the short note and, when the row has candidates, a control that opens a dialog
listing them (type, modification, serial, certificate, dates, Arshin link, the currently matched one
marked). It uses the existing modal and list primitives — no native `<select>` and no `window.confirm`
— as the UI conventions require, and picking is a single action per row.

## Risks / Trade-offs

- [The scan's probe cap can hide the instrument that is actually on the card] → the note states the
  true count, the picker says the list is what the scan found, and the operator can still fix the card
  through the existing «Обновить СИ» flow; a search inside the picker is listed under Open Questions.
- [Rows scanned before this change carry no candidates, and their `serial_ambiguous` flag is false] →
  those rows keep today's behaviour (note plus plain apply); only new scans require a pick.
- [An operator can pick a candidate for the wrong instrument] → the apply writes the picked
  certificate and the journal records the operator; the card keeps its history in the comments, and
  the pick is reversible by the next rescan.
- [Arshin is unavailable while picking] → the pick fails with a clear message and the row keeps its
  previous matched record.

## Migration Plan

1. Additive migration: `candidates_json` (JSON, nullable), `picked_candidate_vri_id` (String(255),
   nullable), `serial_ambiguous` (boolean, not null, default false) on
   `equipment_folder_refresh_rows`. No backfill: existing rows keep their note and remain applicable.
2. Deploy backend first (the schema is additive, so an older frontend keeps working: it ignores the
   new fields).
3. Deploy frontend: the picker appears for newly scanned ambiguous rows.
4. Rollback: the columns are unused by the previous image, so rolling the image back is enough; no
   data migration to reverse.

## Open Questions

- Should the picker also offer an Arshin search (by type, certificate or serial spelling) for the case
  where the scan's candidate list does not contain the instrument on the card? Deferrable: the count
  in the note and the existing card-level refresh cover the rare case until then.
- Should a picked candidate be remembered per instrument (preselected on the next rescan of the same
  card)? Deferrable: it changes convenience, not the contract.
