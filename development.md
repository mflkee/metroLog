# Development Buffer

## Purpose
Short working buffer for the current state of the project.

## Current Phase
Phase 2 - Equipment Registry Foundation

## Current Status
Current small Stage 2 slice is implemented: `SI` onboarding now includes Arshin search by certificate number, detail fetch by `vri_id`, a fuller collapsible SI block on the equipment card, manual refresh of an existing SI card by entering a new certificate number, bulk Excel import by certificate numbers into the selected folder, Excel export of the current registry selection, a richer first repair flow from the equipment card with route fields, dialog messages, and repair attachments, the separate repairs page with active/archive tabs, search, editable repair milestone dates, derived deadline chain, overdue calculation, and semantic process-strip segments, the first independent verification flow for `SI`, the separate `Поверка СИ` page with active/archive tabs, search, milestone editing, explicit completion with confirmation, grouped verification with shared batch messages and shared batch milestone updates, informative expandable archived verification entries with ZIP download, and an archive link from the equipment card.

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
- Separate `Ремонты` page now lists active and archived repairs, supports search, and shows a vertical stage view with route, current stage, and overdue summary.
- Repair queue read-model is now computed on the backend, so frontend does not derive overdue/active-vs-archived logic on its own.
- Active repairs can now update milestone dates from the dedicated `Ремонты` page, while deadline chain and overdue counters are derived on the backend:
  - `repair_deadline_at = sent_to_repair_at + 100 days`
  - `registration_deadline_at = arrived_to_lensk_at + 5 days`
  - `control_deadline_at = actually_received_at + 40 days` with fallback from registration deadline
  - `payment_deadline_at = incoming_control_at + 70 days` with fallback from control deadline
- Repair milestone updates now generate system messages in the repair dialog, mirroring the verification page pattern.
- `SI` equipment card now also supports an independent active verification flow with its own route fields, dialog thread, and attachments.
- Backend now enforces one active verification per `SI` item and keeps repair and verification visible independently on the same card.
- Separate `Поверка СИ` page now lists active and archived verification records, supports search, and gives quick access to the equipment card and Arshin link.
- Active verification milestone editing now belongs to the dedicated `Поверка СИ` page; the equipment card keeps only a compact current-state summary plus the verification dialog.
- Equipment registry now supports multi-select and grouped verification creation for all-SI selections with an operator-defined group name.
- Equipment registry now supports batch deletion of the currently selected items from the same filtered workspace.
- Verification queue now groups records visually by batch name when they were created together from the registry.
- Grouped verification now shares one dialog thread by `batch_key`, so messages added from any card in the batch are visible across all related `SI` cards.
- Verification batch milestone updates can now be applied to the whole active group at once instead of editing each record separately in backend state.
- Dedicated `Поверка СИ` UI now renders grouped verification as one expandable batch card with shared milestones, one shared dialog, and visible group membership.
- Active single verification now follows the same page pattern as repairs: summary header, left-side compact equipment card, right-side milestone panel, and a dedicated dialog block below.
- Active single and grouped verification can now be explicitly completed and moved into the archive.
- Archived verification entries are now informative and expandable; ZIP export from the archive list contains `dialog.txt` and a `files/` folder.
- Equipment card now shows a small archive link under attachments that opens the archived verification tab.
- Completing verification now goes through an explicit confirmation modal for both single and grouped flows.
- All active frontend date inputs now use one shared `dd.mm.yyyy` text-based input instead of browser-native `mm/dd/yyyy` date pickers.
- Active repairs now allow correcting the original `sent_to_repair_at` date from the dedicated repairs page, and the backend recalculates the repair deadline chain from the updated start date.
- Equipment registry now supports bulk send-to-repair alongside bulk verification and batch delete, and the registry table uses zebra row shading instead of separated row gaps.
- Repair and verification queues now share one action-button pattern plus a collapsed process-strip that places process milestones directly on the line; this is the visual foundation for the later richer timeline bar with denser event markers.
- Repair timeline logic is now clarified: the `100-day` repair deadline belongs to the milestone `Ремонт произведен`, not to the end of the whole process; the visual repair strip uses an approximately `250-day` baseline window and expands further only when real dates go beyond it.
- Repair and verification milestone dates are now validated chronologically on both frontend and backend: a later stage cannot be saved before an earlier stage exists or with a date earlier than the previous completed stage.
- Process strips now support semantic colored intervals: completed operations should be shown as green segments with hover duration, while overdue parts of repair should be shown as red segments with explicit hover explanation.
- Deadline markers on repair strips now use semantic colors too: on-time completion becomes green, active non-overdue deadlines stay neutral, and only real overdue deadlines stay red.
- Expandable process panels now default to collapsed state across cards and process pages instead of auto-opening after data load.
- Shared `DateInput` now uses compact `dd.mm.yyyy` presentation everywhere and provides a `Сегодня` shortcut button.

## Current Scripts
- `scripts/check.sh`
- `scripts/local/setup.sh`
- `scripts/local/backend.sh`
- `scripts/local/frontend.sh`
- `scripts/docker/deploy.sh`
- `scripts/docker/smoke.sh`

## Remaining Gaps
- Repair completion is still not implemented from `/repairs`; verification already has the full close/archive loop, repair does not.
- Completed repairs still do not produce the same informative archive experience as verification: archive list entry, ZIP download, and card-level archive record/link are missing.
- Grouped repair exists only as registry-side creation; it still lacks grouped workspace parity with grouped verification:
  - shared grouped repair dialog,
  - shared grouped repair milestone editing,
  - grouped repair completion and archive behavior.
- Process batch membership is still not editable after creation for repair or verification, even though this remains part of the target product model.

## Next
1. Implement explicit repair completion on `/repairs`, gated by `paid_at`.
2. Move completed repair into archived repairs with the same informative archive pattern already used for verification.
3. Add compact archived repair record and archive link on the equipment card under attachments/process blocks.
4. Bring grouped repair to parity with grouped verification:
   - grouped repair card on `/repairs`,
   - one shared batch dialog,
   - one shared milestone editor,
   - grouped completion/archive flow.
5. After repair archive parity is done, return to batch membership editing and later exports for dedicated repair/verification views if they are still needed.
