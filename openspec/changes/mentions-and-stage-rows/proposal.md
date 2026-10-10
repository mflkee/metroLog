# Proposal

## Why

Two things the owner read as noise on the screens they use every day.

A mention in a comment or a message (`@БулашевАН`) is plain text. It is what sends the
notification, so it is worth seeing, and today it is indistinguishable from the words around it.

In a repair or a verification, expanding a card shows each stage as a row of captioned cells:
«Дата», «Дедлайн», «Статус». The captions are redundant - the date field already shows
`дд.мм.гггг` and a status reads as itself («Выполнено») - and they make every row taller and the
expanded card longer than it needs to be.

## What Changes

- A mention SHALL be picked out in the theme's blue, and SHALL NOT rely on colour alone (a little
  weight comes with it).
- The stage rows of an expanded repair or verification card SHALL NOT carry the «Дата» and
  «Статус» captions: the field's own placeholder and the status text carry the meaning, and the
  row aligns at the top.
- A stage's status SHALL carry its meaning in colour as a second cue: done (a date is filled) is
  green, still waiting (no date) is yellow, and lateness is red - in the theme's own tokens, never
  a hardcoded colour, and derived from the row's data rather than from matching the label text.
- The mention colour SHALL be a token per theme (`--mention`), so it stays readable (WCAG AA) on a
  card in every theme - including the two whose blue is too dim to be text.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ui-design-system`: adds the mention treatment and the caption-free stage row.

## Impact

- Frontend only: a new `MentionText` component with its `splitMentionText` helper, the eight
  message and comment render sites (`EquipmentDetailsPage.tsx`, `RepairsPage.tsx`,
  `VerificationPage.tsx`, `TaskDetailsPage.tsx`), the `--mention` token in
  `src/shared/styles.css`, and the stage rows in `RepairsPage.tsx` / `VerificationPage.tsx`.
  No API, schema or data change.
