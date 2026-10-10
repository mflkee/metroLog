# Tasks

## 1. The app's own numeric field

- [x] 1.1 Add `sanitizeNumericInput` (digits only; at most one separator and one leading sign when asked) and `numericInputValue` to `src/lib/numericInput.ts`, with unit tests for letters, `e`/`+`/`-`, `maxLength`, the separator and the sign.
- [x] 1.2 Add `src/components/NumberInput.tsx`: a text field with `inputMode="numeric"`, `autoComplete="off"` and the sanitiser on change, mirroring `DateInput` and `Select`.
- [x] 1.3 Use it for the manufacture year (the equipment form and the equipment card, capped at four digits) and for a preset stage's deadline (empty means no deadline).
- [x] 1.4 Remove the now-dead number-field rules from the stylesheet.
- [x] 1.5 Add a guard to `src/lib/uiConventions.test.ts` that fails when a source file asks the browser for a number field.
- [x] 1.6 Record the rule in `AGENTS.md` (UI conventions) next to the select and dialog rules.

## 2. Checks

- [x] 2.1 `npm run check` is green, the new guard and the sanitiser tests included. Done: ruff clean, backend 153 passed, eslint 0 errors, frontend 147 passed (27 files), build ok.
- [ ] 2.2 On Stage, typing a letter into the year or the deadline field leaves the value unchanged, a pasted five-digit year is cut to four, and scrolling the page over a focused field no longer changes the value.
- [ ] 2.3 On Stage, a deadline of `0` saves as `0`, an empty deadline saves as no deadline, and the preset form submits without a browser validation bubble.
