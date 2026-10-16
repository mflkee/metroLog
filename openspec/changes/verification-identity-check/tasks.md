# Tasks

## 1. Identity gate in the matcher

- [x] 1.1 Add the ambiguity probe to `backend/app/services/folder_refresh_matcher.py`: after a candidate is chosen, count the distinct `(mit_number, mi_modification)` signatures Arshin holds for that serial, and report them on `FolderRefreshMatchResult` (`serial_ambiguous`, `serial_variants`) — verify with a test where the serial returns two different types and the row requires review
- [x] 1.2 Keep a unique serial clean: verify with a test that a single-signature serial leaves `serial_requires_review` and `uncertain_update` false
- [x] 1.3 Extend the matcher note with the ambiguity sentence naming the conflicting types, and verify with a test asserting that the types appear in the note

## 2. Row mapping and Stage check

- [x] 2.1 Let the ambiguity ride the existing review flag (the matcher folds it into `uncertain_update`, which the row maps to `UPDATED_UNCERTAIN` with that note) and verify with the matcher test plus the existing row-mapping test in `backend/tests/test_equipment.py`
- [ ] 2.2 Re-scan the folders touched by the ХАЛ import on Stage and verify that the cards whose serial is shared (2582, 2718, 2719, 2517, 2470) come back as review rows instead of «Актуальная запись подтверждена»

## 3. Card shows the certificate's instrument

- [x] 3.1 Confirm the SI block already renders the certificate's registry number, type and modification (`Сведения о результатах поверки СИ` in `EquipmentDetailsPage.tsx`) — no change needed there
- [x] 3.2 Add the contradiction helper to `frontend/src/lib/equipmentDetails.ts` (stem-based comparison of the certificate's type + modification against the card's) with a unit test covering `ИВТМ-7М`/«Манометры» (warns) and `МКУ`/«Манометры, мод. МКУ» (quiet)
- [ ] 3.3 Render the warning in the SI block (done) and verify on Stage that a card with a foreign certificate shows it

## 4. Documentation

- [x] 4.1 Record the identity rule in `AGENTS.md` (Arshin integration: serial alone is not identity; ambiguity goes to review; the card shows the certificate's instrument)

## Workflow follow-up

- Release per the project rules (version bump, `CHANGELOG.md`, annotated tag, `main:release/X.Y.Z`).
- Walk the remaining review cards (2570 «SLFA-20», 2628 «МКУ») with the owner and merge the cards that share a serial.
- Archive this change once the spec has been synced.
