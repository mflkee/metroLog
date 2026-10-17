# Tasks

## 1. Candidates live on the review row

- [ ] 1.1 In `folder_refresh_matcher.py`, keep the records of the serial probe as candidates
      (`vri_id`, `mit_number`, `mit_title`, `mi_modification`, `mi_number`, `certificate_number`,
      `org_title`, `verification_date`, `valid_date`, `arshin_url`) instead of reducing them to
      `mit_number + title` strings, and return them (plus a `serial_ambiguous` flag) on the match
      result. Verify with a matcher test whose fake Arshin client returns instruments of two types
      for one serial: the result carries two candidates and the flag is true; with a single
      instrument the candidate list is empty and the flag false.
- [ ] 1.2 Add `candidates_json`, `picked_candidate_vri_id` and `serial_ambiguous` to
      `EquipmentFolderRefreshRow` and an additive migration; persist the candidates when the scan
      writes a row. Verify: the migration applies and rolls back on the test database, and a scan
      test shows the row carrying the candidates and the flag.
- [ ] 1.3 Map the new fields into the refresh row read schema so the review table can read them.
      Verify with a test that the folder-refresh task details endpoint returns `candidates` and
      `pickedCandidateVriId` for a scanned ambiguous row.

## 2. The note stops listing types

- [ ] 2.1 Rewrite the ambiguity sentence in `_build_match_note` to name the count only
      («Заводской номер в Аршине есть у N приборов — выберите нужный»), keeping the other
      sentences as they are. Verify with note tests: an ambiguous result's note carries the count and
      no type number; a single-instrument result carries no ambiguity sentence.

## 3. Picking a candidate

- [ ] 3.1 Add the pick to the folder-refresh service: given a row and a `vri_id`, fetch that record's
      Arshin detail, write it into the row's `matched_*` fields and `matched_payload_json`, store
      `picked_candidate_vri_id`, and refuse a `vri_id` that is not among the row's candidates.
      Verify with a test using a stub Arshin client: the pick updates the matched certificate, dates
      and payload, and an unknown `vri_id` returns a 4xx.
- [ ] 3.2 Expose it as an async route
      `POST /equipment/folders/{folder_id}/refresh-tasks/{task_id}/rows/{row_id}/candidate` with
      `{"vri_id": …}`, returning the updated row. Verify with an API test that the pick persists
      across a re-read of the task details (the choice survives a reload).

## 4. Applying an ambiguous row requires the choice

- [ ] 4.1 Guard `_apply_folder_refresh_row`: refuse a row flagged `serial_ambiguous` with no picked
      candidate («Выберите прибор, чей это сертификат»), and refuse a picked candidate whose
      verification date is earlier than the row's current verification. Verify with apply tests:
      both refusals return `applied: false` with their message and leave the card untouched; a picked
      valid candidate applies and writes the picked certificate.
- [ ] 4.2 Cover ESI module rows with the same flow. Verify with an apply test on a
      `ESI_INTERNAL`/`ESI_EXTERNAL` row: the guard and the pick behave as for an SI row.

## 5. The picker in the review table

- [ ] 5.1 Extend the frontend types and `src/api/equipment/folders.ts` with the candidates and the
      pick call. Verify with a vitest that the mapper carries `candidates` and `pickedCandidateVriId`
      and that the pick call sends the right body and path.
- [ ] 5.2 Render the short note and, for rows with candidates, a control opening the candidate list
      (type, modification, serial, certificate, laboratory, dates, Arshin link, the matched one
      marked) that picks a candidate. Verify with component tests: a row with candidates shows the
      control and picking calls the API; a row without candidates shows the plain note;
      `npm run check:ui` and the build stay green, and no native `<select>`/`window.confirm` is
      introduced (the existing conventions test covers the latter).

## 6. Verification on the real object

- [ ] 6.1 On Stage, rescan the folder «СИКН 1520» and open a row whose serial is ambiguous (for
      example a ТЛ-4 whose short serial belongs to several types): the note names the count, the
      picker lists the candidates with their laboratories, picking one shows it as the record to be
      written, and applying it changes the card's certificate and shows the operator in the journal.
      Also open the row of ТЛ-4 зав. 841, where the offered certificate belongs to another laboratory
      (Термоприбор against the card's Якутский ЦСМ): the laboratory is visible in the list and the
      row is left unapplied. Verify by inspecting the card and the event journal after the apply.

## Workflow follow-up

- Release the change (Stage review, version bump, tag) and archive the change afterwards.
