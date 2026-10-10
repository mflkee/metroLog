# Proposal

## Why

Every date field carries a «Сегодня» button to its left. It reads as a second control of its own
next to the field, competes with the calendar toggle that already lives inside the field, and the
calendar already highlights today and selects it in one click. Two Arshin search fields had already
switched it off (`showTodayButton={false}`) - the same judgement from the other direction: the
button is noise, and whether it appears should not be a per-field decision.

## What Changes

- A date field SHALL be the field and its calendar toggle, nothing else: the separate «Сегодня»
  shortcut SHALL be removed from the component, not merely switched off per call site.
- Today SHALL stay reachable in one click, because the calendar highlights it.
- A guard SHALL fail the test run when the shortcut reappears in the sources or the stylesheet.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the requirement that a date field carries no separate shortcut.

## Impact

- Frontend only: `src/components/DateInput.tsx` (the button, its handler, the `showTodayButton`
  prop and the now-unused `Icon` import), `src/shared/styles.css` (the `.date-input__today` rules
  and the flex wrapper that existed only to align the button), and the two `ArshinPage.tsx` call
  sites that passed `showTodayButton={false}`. No API, schema or data change.
