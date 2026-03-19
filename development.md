# Development Buffer

## Purpose
Short working buffer for the current state of the project.

## Current Phase
Phase 2 - Equipment Registry Foundation

## Current Status
Current small Stage 2 slice is implemented: `SI` onboarding now includes Arshin search by certificate number, detail fetch by `vri_id`, a fuller collapsible SI block on the equipment card, manual refresh of an existing SI card by entering a new certificate number, bulk Excel import by certificate numbers into the selected folder, Excel export of the current registry selection, a richer first repair flow from the equipment card with route fields, dialog messages, and repair attachments, and the first independent verification flow for `SI`.

## Completed
- Stage 1 internal auth is working: bootstrap admin, admin-created users, temporary passwords, forced password change, profile metadata, and admin user-detail pages.
- Theme preference is now treated as user-bound shell personalization and should persist in the user profile across clients after login.
- Settings page now manages which themes remain visible in the top-right switcher; default visible themes stay `light`, `gray`, and `dark`.
- Stage 2 registry foundation is present: folders, groups, equipment registry, equipment details, edit/delete flows, and basic filtering/search.
- Registry-facing status must reflect an active repair, so an item with an open repair should show as `IN_REPAIR`.
- Folder-level suggestions now matter for recurring manual values such as object name, current location, repair city, and repair destination.
- Product workflow is уточнен: repair and verification are independent processes; equipment cards should replace neighboring equipment with attachments and process panels.
- Grouped process decision is now fixed: one shared dialog thread per batch, mutable batch membership, ZIP archive contains only the dialog and its attachments.
- Excel export is now expected for registry-like pages with current filters applied.
- `SI` onboarding is now clarified: `SI` must be added through Arshin search + `vri_id` enrichment, while non-`SI` keeps normal manual creation.
- Folder color functionality was removed from the product and from the active UI.
- Folder list now uses compact cards plus a search field instead of color coding.
- Unused local font assets and old font-variant styling were removed from the active frontend.
- Dead runtime leftovers from the abandoned email/auth-code flow were removed from backend code.
- Root docs and setup flow were aligned around local development first, Docker second.
- Deploy/check scripts were added under `scripts/`.
- Equipment card now has `Attachments` instead of neighboring equipment.
- Backend stores attachment metadata in DB and files on disk under `storage/equipment-attachments/`.
- Equipment card supports upload, list, download, and delete of static attachments.
- Targeted backend test now covers attachment upload/list/download/delete flow.
- Equipment card now has static comments with author, timestamp, list, and add-comment flow.
- Comment authors can now edit and delete their own static card comments.
- Targeted backend test now also covers static comment create/update/delete flow.
- First richer `SI` onboarding slice is now implemented: certificate-number Arshin search, detail fetch by `vri_id`, and persistence of both short and detailed SI payloads on the equipment card.
- Backend now rejects plain manual creation of `SI` records without Arshin-backed `si_verification` payload.
- Equipment card for `SI` now shows a collapsible Arshin-oriented detail block and direct Arshin link.
- Existing `SI` cards now support manual certificate-based refresh: operator enters a new certificate number, selects the Arshin result, loads `vri_id` detail, and updates the same equipment card without recreating the record.
- Equipment registry now supports bulk `SI` onboarding from Excel/CSV files with certificate numbers inside the selected folder workspace.
- Bulk import uses the selected folder plus operator-entered object/location fields and returns a row-by-row report with `created`, `skipped`, and `error` outcomes.
- Bulk import parser now searches upper rows for headers like `Свидетельство`, `Документ`, and if a `Дата поверки` column exists, its year is passed into Arshin search for the corresponding row.
- Equipment registry now supports Excel export for the current filtered selection in the chosen folder workspace.
- Equipment card repair flow now uses route fields instead of repair organization: operator specifies city and destination when sending a device to repair.
- Repair creation may optionally include the first repair dialog message with files, photos, documents, or checks, but the repair may also be created empty and the dialog can be filled later.
- Backend now enforces one active repair per equipment item and stores repair dialog messages with per-message attachments.
- Equipment card now shows the active repair panel with route information, deadline, and a compact repair dialog thread.
- `SI` equipment card now also supports an independent active verification flow with its own route fields, dialog thread, and attachments.
- Backend now enforces one active verification per `SI` item and keeps repair and verification visible independently on the same card.

## Current Scripts
- `scripts/check.sh`
- `scripts/local/setup.sh`
- `scripts/local/backend.sh`
- `scripts/local/frontend.sh`
- `scripts/docker/deploy.sh`
- `scripts/docker/smoke.sh`

## Next
- Refine the repair page into the vertical stage table derived from the Excel MVP.
- Build the separate verification page after the first card-based verification slice.
- Add archive/close behavior for repair dialog history and attachment bundles.
