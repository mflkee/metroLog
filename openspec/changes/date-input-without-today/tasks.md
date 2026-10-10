# Tasks

## 1. The shortcut goes

- [x] 1.1 `DateInput.tsx`: remove the «Сегодня» button, `handleSetToday`, the `showTodayButton` prop and the now-unused `Icon` import, so no call site can bring it back.
- [x] 1.2 `styles.css`: drop the `.date-input__today` rules and simplify the wrapper - the flex row existed only to align the button, and with one child it is a plain block.
- [x] 1.3 `ArshinPage.tsx`: drop the two `showTodayButton={false}` props, which the component no longer accepts.
- [x] 1.4 Add a guard to `src/lib/uiConventions.test.ts`: no source mentions the shortcut and the stylesheet carries no rule for it.
- [x] 1.5 Record the rule in `AGENTS.md` (UI conventions) next to the select, dialog and numeric-field rules.

## 2. Checks

- [x] 2.1 `npm run check` is green, the new guard included.
- [x] 2.2 On Stage, no date field (equipment card, repairs, verifications, tasks, Arshin search, presets, folders) shows a button beside it; the calendar toggle still opens the calendar, today is highlighted, and one click sets today. Verified on Stage by the owner and released as 0.6.0.
