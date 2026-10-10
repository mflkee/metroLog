# Proposal

## Why

Three fields are still the browser's number input: the manufacture year (the equipment form and the
equipment card) and a preset stage's deadline. The app already hides the browser's spinners in CSS,
so the field looks like ours while it still behaves like the browser's: the mouse wheel changes a
focused field - and the year is then saved into the registry - while `min="0"` on the deadline
raises the browser's own validation bubble, and `e`, `+`, `-` and a locale separator are accepted by
some browsers and rejected by others.

The app draws every other control itself: `Select` instead of `<select>`, `DateInput` instead of a
native date field, `DeleteConfirmModal` instead of `window.confirm`. The number field is the last
one left to the browser.

## What Changes

- A field that holds a number SHALL be the app's own control: a text field with a numeric keyboard
  hint that accepts digits only, so the browser never changes the value, never validates it and
  never accepts a character the field's contract excludes.
- The manufacture year and a preset stage's deadline SHALL use that control.
- A guard SHALL fail the test run when a source file asks the browser for a number field.
- The stylesheet's now-dead number-field rules SHALL be removed.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the requirement that numeric input is drawn by the app.

## Impact

- Frontend only: a new `NumberInput` component with its `sanitizeNumericInput` helper, three call
  sites (`EquipmentPage.tsx`, `EquipmentDetailsPage.tsx`, `SettingsPage.tsx`), the stylesheet and
  the conventions guard. No API, schema or data change: the year is still stored as a string and a
  deadline is still a number or `null`.
