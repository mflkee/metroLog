# Development Buffer

## Purpose
Short working buffer for the current state of the project.

## Current Phase
Phase 2 - Equipment Registry Foundation

## Current Status
Current small Stage 2 slice is implemented: `SI` onboarding now includes Arshin search by certificate number, detail fetch by `vri_id`, a fuller collapsible SI block on the equipment card, manual refresh of an existing SI card by entering a new certificate number, bulk Excel import by certificate numbers into the selected folder, Excel export of the current registry selection, a richer first repair flow from the equipment card with route fields, dialog messages, and repair attachments, the separate repairs page with active/archive tabs, search, editable repair milestone dates, derived deadline chain, overdue calculation, semantic process-strip segments, explicit completion after payment, informative archived repair entries with ZIP download, a repair archive link from the equipment card, grouped repair parity with shared batch messages, shared batch milestone editing, grouped completion, grouped archive behavior, active add/remove membership editing for grouped repairs, and Excel export of the current filtered repairs list; and the first independent verification flow for `SI`, the separate `Поверка СИ` page with active/archive tabs, search, milestone editing, explicit completion with confirmation, grouped verification with shared batch messages and shared batch milestone updates, informative expandable archived verification entries with ZIP download, an archive link from the equipment card, active add/remove membership editing for grouped verification, and Excel export of the current filtered verification list.

## Completed
- Stage 1 internal auth is working: bootstrap admin, admin-created users, temporary passwords, forced password change, profile metadata, and admin user-detail pages.
- Theme preference is now treated as user-bound shell personalization and should persist in the user profile across clients after login.
- Settings page now manages which themes remain visible in the top-right switcher; default visible themes stay `light`, `gray`, and `dark`.
- Settings page now also owns dashboard personalization:
  - the user selects one folder as the analytics scope for `/dashboard`,
  - the user enables or disables dashboard widgets with checkboxes,
  - dashboard preferences are stored on the user profile just like shell theme preferences.
- Stage 2 registry foundation is present: folders, groups, equipment registry, equipment details, edit/delete flows, and basic filtering/search.
- When a folder workspace is open, the equipment page should stay minimal: folder name, actions, filters, and the table itself without explanatory text blocks above the registry.
- Registry-facing status must reflect an active repair, so an item with an open repair should show as `IN_REPAIR`.
- Folder-level suggestions now matter for recurring manual values such as object name, current location, repair city, and repair destination.
- Shared keyboard-first autocomplete foundation is now in place for recurring manual fields:
  - `Объект`,
  - `Местонахождение`,
  - `Откуда`,
  - `Куда`,
  - the current implementation uses existing folder-scoped suggestions and local registry values, supports arrow navigation plus `Enter`/`Tab` selection, and is the base for later extension into comments and process dialogs.
- Autocomplete coverage is now extended:
  - grouped repair/verification names reuse folder-scoped process batch names,
  - initial process messages in registry modals use token-based textarea autocomplete,
  - equipment card comments, initial repair/verification messages, and active repair/verification dialog messages also use token-based textarea autocomplete for recurring entities such as object names, routes, serial numbers, and certificate numbers.
  - active dialogs on `/repairs` and `/verification/si` now follow the same token-autocomplete pattern, so process pages do not diverge from the equipment card UX.
  - search bars on equipment folders, equipment registry, repairs, verification, and batch-item pickers now also use the same autocomplete approach with local contextual suggestions.
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
- Dedicated `/repairs` and `/verification/si` pages now also support Excel export of the current filtered active or archived queue.
- `/events` is no longer a stub:
  - backend now stores an application-level audit log for key equipment, repair, and verification actions,
  - `/events` lists the global journal with free-text search, category filter, and period filter,
  - by default the journal opens on the last `30` days rather than an unbounded history slice,
  - operators can switch to `За все время`, use manual date filters, and export the current journal selection to Excel,
  - grouped repair/verification events should lead into the corresponding grouped process card on `/repairs` or `/verification/si`,
  - single repair/verification events should lead into the corresponding single process entry rather than the generic equipment card,
  - grouped journal rows should not expand into per-equipment lists; the group link is the main drill-down,
  - single process rows should show the compact equipment reference: name, modification, and serial number.
- `/dashboard` is no longer a stub:
  - it now builds analytics from the user-selected folder in settings,
  - widget visibility is controlled by per-user dashboard settings,
  - the main page currently covers summary cards, status/type distributions, top locations, repair-overdue counters, upcoming verification expiry, and recent events for the selected folder.
- Dashboard personalization now also includes:
  - per-user switch for mention emails,
  - additional optional widgets for completed processes and average process duration,
  - broader upcoming-deadline coverage so the dashboard can surface not only SI verification expiry but also manual next-control dates for `ИО` and `ВО`.
- User-facing personalization is per-user rather than global:
  - shell theme,
  - enabled theme set,
  - dashboard folder,
  - dashboard widget visibility,
  - mention email notifications
  are all stored on the authenticated user profile and should remain stable across clients after login.
- Mentions and email notifications are now introduced as a first operational notification slice:
  - `/users/mentions` returns active users as mention candidates for any authenticated user,
  - free-text comments and repair/verification dialogs now support `@mention` autocomplete through the shared textarea autocomplete component,
  - equipment comments may notify mentioned users by email,
  - repair and verification messages may notify mentioned users by email,
  - settings include a direct `Тестовое письмо` action so SMTP can be verified against the current user's email without creating a second account,
  - deep links from mention emails must open the exact comment or process message and flash that target in view.
- Archive navigation from the equipment card now keeps process context stronger:
  - links into archived repair/verification now include `equipmentId`,
  - single archived process cards flash as the target row after navigation,
  - grouped archived cards flash the specific equipment tile inside the group so the operator can immediately see where the current device sits.
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
- Shared date handling no longer relies on browser-native pattern validation; frontend accepts `dd.mm.yyyy`, normalizes it before API requests, and uses local-date `Сегодня` defaults.
- Active repairs now allow correcting the original `sent_to_repair_at` date from the dedicated repairs page, and the backend recalculates the repair deadline chain from the updated start date.
- Equipment registry now supports bulk send-to-repair alongside bulk verification and batch delete, and the registry table uses zebra row shading instead of separated row gaps.
- Registry process actions now distinguish between single and grouped selection:
  - if exactly one item is selected, the registry uses the same repair/verification modal pattern but creates one process for that equipment item,
  - grouped semantics remain only for selections with multiple items.
- Registry UI now blocks sending a selection to repair or verification if any selected item already has the same active process.
- Closing verification now correctly updates the equipment status:
  - back to `IN_WORK` if no other active process remains,
  - stays `IN_REPAIR` if repair is still active.
- Backend detail/list reads now normalize stale transient statuses, so old `IN_REPAIR` / `IN_VERIFICATION` values do not remain visible when there is no active process anymore.
- Repair and verification queues now share one action-button pattern plus a collapsed process-strip that places process milestones directly on the line; this is the visual foundation for the later richer timeline bar with denser event markers.
- Repair timeline logic is now clarified: the `100-day` repair deadline belongs to the milestone `Ремонт произведен`, not to the end of the whole process; the visual repair strip uses an approximately `250-day` baseline window and expands further only when real dates go beyond it.
- Repair and verification milestone dates are now validated chronologically on both frontend and backend: a later stage cannot be saved before an earlier stage exists or with a date earlier than the previous completed stage.
- Process strips now support semantic colored intervals: completed operations should be shown as green segments with hover duration, while overdue parts of repair should be shown as red segments with explicit hover explanation.
- Deadline markers on repair strips now use semantic colors too: on-time completion becomes green, active non-overdue deadlines stay neutral, and only real overdue deadlines stay red.
- Expandable process panels now default to collapsed state across cards and process pages instead of auto-opening after data load.
- Shared `DateInput` now uses compact `dd.mm.yyyy` presentation everywhere and provides a `Сегодня` shortcut button.
- Active repairs can now be explicitly completed from `/repairs`, but only after `paid_at` is filled; completion closes the repair and immediately restores the registry-facing equipment status to `IN_WORK` or keeps `IN_REPAIR` only if another active repair still exists.
- Archived repairs now mirror verification more closely:
  - `/repairs?tab=archived` entries expose archive download as ZIP,
  - repair archive ZIP contains `dialog.txt` plus a `files/` folder,
  - the equipment card shows a compact archive-repair link under attachments.
- Grouped repairs now mirror grouped verification more closely:
  - `/repairs` groups batch-created repairs into one expandable card,
  - active grouped repair uses one shared dialog and one shared milestone editor,
  - grouped repair can be completed in bulk from the repairs page,
  - archived grouped repair remains informative and expandable and downloads one shared ZIP archive,
  - repair batch metadata (`batch_key`, `batch_name`) is now exposed in repair queue reads and archive naming.
- Grouped verification and grouped repair membership can now be edited after creation:
  - grouped cards on `/verification/si` and `/repairs` support adding matching equipment into the active batch,
  - grouped cards also support removing one member from the active batch without destroying the rest of the group,
  - when a member leaves a batch, it becomes a standalone active process and receives a cloned snapshot of the shared dialog history up to that point.

## Current Scripts
- `scripts/check.sh`
- `scripts/local/setup.sh`
- `scripts/local/backend.sh`
- `scripts/local/frontend.sh`
- `scripts/docker/deploy.sh`
- `scripts/docker/smoke.sh`

## Remaining Gaps
- Batch membership editing is implemented, but UX polish around candidate picking, empty states, and possible confirmation affordances may still be refined later.
- Dashboard content is live, but it can still grow with more operational metrics such as completed repairs, completed verifications, month-over-month throughput, and heavier repair/verification aging counters.
- Mention notifications currently depend on SMTP environment configuration and best-effort email delivery; transport health and retry policy are still minimal.
- `ИО` and `ВО` now support manual control metadata:
  - control date,
  - control period in months,
  - registry-facing `След. срок` based on attestation for `ИО` and technical inspection for `ВО`,
  - if no control date is set, the registry should show `-`.
- Event logging currently covers the main operational actions, but it may still be expanded later if the product needs narrower audit slices or stronger dashboard counters.

## Next
1. Continue visual and workflow polish around process pages, event journal rows, and archive views now that grouped membership editing, exports, dashboard, and event journal are in place.
2. Expand dashboard metrics:
   - completed repairs,
   - completed verifications,
   - aging buckets,
   - facility/object trend slices,
   - stronger overdue breakdowns by stage.
3. If operators need it later, add a stronger management layer for existing batches:
   - explicit candidate filters,
   - optional confirmation on removing a member from a group,
   - clearer history markers for join/leave operations inside dialogs.
4. Consider separate export variants later only if operators need narrower reporting slices than the current queue exports.
5. If mention emails become a core workflow, add transport observability:
   - delivery log,
   - failure counters,
   - resend/retry policy,
   - possibly in-app notification mirrors.
