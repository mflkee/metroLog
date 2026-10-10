# Tasks

## 1. A readable red

- [x] 1.1 Add `--danger-text`: `var(--danger)` by default, and lightened in the three themes whose shared red misses AA as text - nord (65% red + 35% theme text: 3.48 → 4.66), catppuccin (70%: 4.35 → 5.10) and dracula (80%: 4.33 → 5.18), each measured on its own panel.
- [x] 1.2 Point every danger *foreground* at the new token: the twenty-one `text-[color:var(--danger)]` sites, the legacy `text-[#b04c43]`/`text-[#8f443d]` mapping, `.btn-danger`'s label, the danger icon actions, and the danger tones of `StatCard`/`StatusBadge`. Surfaces keep `--danger` (tints, borders, solid backgrounds).
- [x] 1.3 Fix `.btn-danger`, which painted its label with the raw `#b04c43` (1.90-3.38 in every theme) because the compatibility layer only rewrites class names, never bespoke CSS.
- [x] 1.4 Record the rule in `AGENTS.md` (UI conventions) and update the `taskTable` test that asserted the old class.

## 2. Checks

- [x] 2.1 `npm run check` is green. Done: ruff clean, backend 153 passed, eslint 0 errors, frontend 159 passed (28 files), build ok; the token is present in the built stylesheet.
- [x] 2.2 On Stage, an error line, an overdue mark and a danger button label are readable in nord, catppuccin and dracula, and nothing that is a tint or a border has shifted. Verified on the owner's screen; released as 0.6.0.
