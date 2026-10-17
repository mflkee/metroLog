# Spec Delta

## Purpose

Human text in metroLog — comments, messages, task descriptions, the changelog — is written as
markdown: this capability says what is rendered, how mentions survive it, and how the text is
previewed while it is being written.

## ADDED Requirements

### Requirement: Human text is rendered as markdown

Comments, repair and verification messages, task descriptions and the «Что нового» view SHALL render
their text as markdown: headings, bullet and numbered lists, emphasis, inline code and links.

#### Scenario: A comment with markdown

- **WHEN** a comment contains `# Заголовок`, a `- пункт` line and `**жирный**`
- **THEN** the reader sees a heading, a bullet list and bold text

#### Scenario: The changelog in «Что нового»

- **WHEN** the owner opens «Что нового»
- **THEN** the changelog is rendered with its headings and bullets
- **AND** no `##` characters are shown as text

### Requirement: Raw HTML stays text

The renderer SHALL NOT execute or render raw HTML from the text: it is shown as its own characters.

#### Scenario: A comment with a tag

- **WHEN** someone writes `<b>важное</b>` in a comment
- **THEN** the tag is visible as text and nothing is bolded by it

### Requirement: Mentions survive markdown rendering

An @-mention SHALL be highlighted inside any markdown block — a paragraph, a heading, a list item —
exactly as in plain text, and a mention SHALL still not be recognised inside an e-mail address.

#### Scenario: A mention inside a list

- **WHEN** a message has `- уточнить у @ИвановИИ`
- **THEN** the list item is rendered as a list
- **AND** `@ИвановИИ` is highlighted

#### Scenario: An e-mail in a message

- **WHEN** the text contains `ivanov@mkair.ru`
- **THEN** no mention is highlighted inside it

### Requirement: The editor previews markdown while typing

The field used to write comments and messages SHALL style markdown as it is typed, and SHALL hide
markdown markers on the lines that are not being edited.

#### Scenario: Typing a heading

- **WHEN** the writer starts a line with `# ` and a word
- **THEN** the line is shown as a heading immediately, without leaving the field

#### Scenario: Markers on the edited line

- **WHEN** the caret is on a line containing markdown markers
- **THEN** that line shows its markers, so they can be edited

### Requirement: The editor keeps the behaviours of the field it replaces

The editor SHALL keep the mention suggestion popup, the `Ctrl+Enter` submit shortcut, the growth of
the field with its content, the character limit and the placeholder of the field it replaces, so no
screen has to change how it is used.

#### Scenario: Mention suggestions

- **WHEN** the writer types `@` and a letter in a comment field
- **THEN** the suggestion list opens as it did with the plain field

#### Scenario: Submitting with the keyboard

- **WHEN** the writer presses `Ctrl+Enter` in a message field
- **THEN** the message is submitted as before
