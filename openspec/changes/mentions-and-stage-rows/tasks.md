# Tasks

## 1. A mention is visible

- [x] 1.1 Add `splitMentionText` to `src/lib/mentions.ts`: `@` followed by alphanumerics, matching the backend's key shape (`build_user_mention_base`), and only where the `@` starts a word so an email address is not half-lit. Unit-tested: a sentence, several mentions, a disambiguated key (`@БулашевАН12`), an email address, a bare `@`, and that the text around a mention comes back unchanged.
- [x] 1.2 Add `MentionText` (`src/components/MentionText.tsx`) and use it at all eight message and comment render sites, so no screen shows a raw mention.
- [x] 1.3 Add the `--mention` token: `--info` by default, `#88c0d0` (nord8) for nord and a lightened aqua for gruvbox - the two themes whose blue is too dim on a card. Measured the contrast on the message card for all seven themes: with `--info` alone, nord sits at 3.35 and gruvbox at 4.46; the chosen values give nord 4.50 and gruvbox 4.88, and every other theme is between 5.31 and 8.30.
- [x] 1.4 Style `.mention` with the token plus `font-weight: 600`, so the meaning does not rest on colour alone.
- [x] 1.5 Record the token in `AGENTS.md` (UI conventions): a mention is the theme's blue and must hold AA on a card.

## 2. The stage row loses its captions

- [x] 2.1 Remove the «Дата» caption from all four expanded-card stage rows (the repair queue row and group card, the verification group card and queue row); the date control keeps its `дд.мм.гггг` placeholder.
- [x] 2.2 Remove the «Статус» caption from the same four rows, and let the verification status read as primary text (`text-sm text-ink`) with the deadline as its small note.
- [x] 2.3 Drop the padding that only compensated for the caption height on the actions cell (`xl:pt-5` / `md:pt-5`), so the whole row aligns at the top.
- [x] 2.4 Keep the «Дедлайн» caption of the repair rows and the captions of the read-only archive row: the owner named «Дата» and «Статус», and two bare dates in a row would be ambiguous. Left for the owner to confirm on Stage.
- [x] 2.5 Colour the status of every stage row by its tone: `getProcessStageTone` (done / waiting / late) and `PROCESS_STAGE_TONE_CLASS` in `src/lib/processStages.ts`, used by the four expanded-card rows and by the read-only archive row of a repair. Unit-tested for the three tones, for lateness with and without a date, and for each class coming from a theme token.
- [x] 2.6 Replace the hardcoded `#b04c43` of the status and overdue lines with the theme's `--danger`, and drop the now-dead `accent` field from `RepairStageRow`. Measured on the panel: the hardcoded red sits at 1.90-3.38, the token at 3.48-6.19, so every theme gains.

## 3. Checks

- [x] 3.1 `npm run check` is green, the mention and tone tests included. Done: ruff clean, backend 153 passed, eslint 0 errors, frontend 159 passed (28 files), build ok; the three tone utilities are present in the built stylesheet.
- [ ] 3.2 On Stage, writing `@БулашевАН` in a comment or a message shows the name in the theme's blue; an email address in the text stays plain.
- [ ] 3.3 On Stage, expanding a repair and a verification card shows stage rows without «Дата»/«Статус», the row is shorter, and the actions align with the date field.
- [ ] 3.4 On Stage, a completed stage reads green and a waiting one yellow in both a repair and a verification, a late stage stays red, and every colour follows the chosen theme.
