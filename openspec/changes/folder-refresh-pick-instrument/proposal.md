# Proposal

## Why

The review note for an ambiguous serial names every instrument Arshin carries for that serial — in
production it turned into a wall of dozens of type numbers in a single cell, and the operator still
cannot act on it: the refresh keeps exactly one matched record, and applying the row writes that
one. The note asks "проверьте, чей это сертификат" while the screen offers nothing to check it with.

## What Changes

- The refresh keeps the candidates it already found for an ambiguous serial (type number and title,
  modification, serial, certificate, verification and valid dates, Arshin link) on the review row,
  instead of reducing them to a sentence in the note.
- The row note becomes short: it says how many instruments carry the serial and that a choice is
  required. The list of type numbers moves out of the note and into the candidate list.
- The review screen shows the candidates per row and lets the operator pick one; the picked
  candidate becomes the row's matched record, so the table shows what will be written.
- A row whose serial belongs to several instruments cannot be applied until a candidate is picked —
  no silent apply of the matcher's guess.
- Applying a picked candidate writes that verification (certificate, dates, Arshin link) and the
  journal records who picked it.
- ESI module rows follow the same flow.

Unchanged: the matching rules that decide which candidate is found first, the rule that a candidate
older than the current verification is never applied, and the requirement that an ambiguous row is
always offered for review rather than updated silently.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `equipment-folder-refresh`: the ambiguity report becomes a candidate list the operator picks
  from, and applying an ambiguous row requires that pick.

## Impact

- Backend: `app/services/folder_refresh_matcher.py` (keep the probe records as candidates),
  `app/services/equipment_folder_refresh.py` (apply the picked candidate, guard ambiguous rows),
  the refresh row model plus a migration (candidate payload, picked candidate), refresh schemas and
  the folder-refresh routes.
- Frontend: the folder-rescan review table on the equipment registry page (candidate picker, short
  note), `src/api/equipment/folders.ts`, registry helpers and types.
- Arshin: no new request shape — the candidates come from the serial probe the refresh already
  makes for the ambiguity check.
