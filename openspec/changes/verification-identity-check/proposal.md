# Proposal

## Why

metroLog can hold a verification that belongs to a **different instrument**: Arshin lookups keyed on
the serial number alone, and short serials are shared by many instruments of different types —
`45549` is carried by 21 Arshin records, `201003` by 31. On 2026-10-16 the ХАЛ journals exposed
eight such cards (2517, 2470, 2714, 2718, 2719, 2582, 2627 and more): the card showed a valid
certificate of, say, «Манометры, вакуумметры», while the instrument is «Измеритель влажности» —
and folder refresh happily reported «Актуальная запись подтверждена», because the stored
certificate's own type was used as the search anchor. Nothing in the product ever asks whether the
certificate belongs to *this* instrument, so the operator only finds out from the paper journal.

## What Changes

- **Never auto-apply an ambiguous identity.** When the serial of a matched record is also carried by
  Arshin instruments of another type, the refresh stops treating the match as resolved: the row
  needs review and its note names the conflicting instruments.
- **Show what the certificate belongs to.** The SI block of the equipment card prints the
  instrument type and modification stored in the verification, next to the card's own name and
  modification.
- **Warn on a contradiction.** When the stored certificate's type and the card's modification name
  different instruments, the card shows a warning instead of a plain "verified until" date.
- Keep the existing serial-spelling tolerance (spaces, look-alike letters, a letter added) — the
  identity gate is about *which instrument*, not about *how the serial is written*.

## Capabilities

### New Capabilities
- `verification-identity`: how metroLog decides that a verification belongs to the instrument shown
  on the card, when that decision must be handed to a human, and how a mismatch is surfaced.

### Modified Capabilities
<!-- None: `equipment-folder-refresh` requirements are unchanged; the identity gate adds to the
     match result on top of the serial tolerance already specified there. -->

## Impact

- **Backend**: `app/services/folder_refresh_matcher.py` (an ambiguity probe and the review flag),
  `app/services/equipment_folder_refresh.py` (row note/status), tests.
- **Frontend**: the SI section of the equipment card (`components/equipment-details/SiSections.tsx`,
  `lib/equipmentDetails.ts`) shows the certificate's instrument and warns on a contradiction.
- **Database**: no migration — the row already carries `notes`/`uncertain_update`, and the card uses
  data it already has.
- **Ops**: an audit of the fleet for the same defect, and re-scan of the folders touched.
