# Proposal

## Why

Everything people write in metroLog — comments on equipment, messages in repairs and verifications,
task descriptions — is plain text: no headings, no lists, no emphasis, no links. «Что нового» parses
the changelog by hand and prints markdown markers as literal characters. The owner asked for markdown
everywhere the text is human, and — the important part — for it to be rendered **while typing**, the
way Obsidian does it: you type `#` and the line is already a heading.

## What Changes

- **Markdown everywhere the text is human**: equipment comments, repair/verification messages, task
  descriptions and task messages, and the «Что нового» view.
- **One display path**: a `MarkdownText` renderer (headings, lists, emphasis, inline code, links,
  GFM tables) — raw HTML stays text, so no injection through a comment.
- **✳️ @-mentions keep working**: a mention is highlighted inside a paragraph, a heading or a list
  item exactly as it is today, and an e-mail address is still not a mention.
- **Live preview while typing**: the shared comment/message field becomes an editor (CodeMirror 6)
  that styles the text as it is typed — a `#` heading, a `-` list, `**bold**`, a quote, inline code —
  and hides the markers on the lines you are not editing, Obsidian-style. Mention suggestions and
  `Ctrl+Enter` keep working, and the field grows with its content.
- **«Что нового» renders the changelog** instead of printing markdown markers.

## Capabilities

### New Capabilities
- `markdown-text`: which human text in the product is markdown, how it is rendered in a read-only
  view, and how it is previewed while it is written.

### Modified Capabilities
<!-- None. -->

## Impact

- **Frontend**: new dependencies (`react-markdown`, `remark-gfm`, `@codemirror/*`); new components
  `MarkdownText`, `MarkdownEditor`; `AutocompleteTextarea` becomes the markdown editor behind the
  same props; message/description displays and `WhatsNewModal` switch to the renderer; tests.
- **Backend / database**: none — the text is already stored as text.
- **Ops**: the editor changes the typing surface of every comment and message field, so Stage comes
  first and production only after the owner has used it.
