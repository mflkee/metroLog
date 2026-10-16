# Design

## Context

See `proposal.md` — Why for the eight cards found through the ХАЛ journals.

Two facts shape the approach:

- **The stored certificate's own type cannot be the only anchor.** Folder refresh searches Arshin
  with the parameters of the *current* record, so a wrong record keeps producing wrong matches: for
  «Измеритель влажности ИВТМ-7М» (`45549`) the stored certificate was a манометр record, and stage 2
  then found *newer манометр* records and offered them as updates. The defect is self-sustaining.
- **The card's name may itself have been overwritten** by the same refresh path
  (`refresh_si_verification` writes `equipment.name`/`modification` from Arshin), so a comparison of
  the stored type against the name is only a hint, not proof. What is *not* circular is the serial:
  Arshin resolves it to a set of instruments, and a set with several types means the identity was
  never established.

Measured ambiguities: `45549` → 21 Arshin records, `60299` → 21, `201003` → 31, `15113412` → 2.

## Goals / Non-Goals

**Goals:**

- Stop attaching or offering verifications whose instrument cannot be established, without losing
  the serial-spelling tolerance added for the ХАЛ/SИКН cases.
- Make the instrument behind a stored certificate visible on the card, and warn when it does not
  look like the card's instrument.
- Ship without a migration.

**Non-Goals:**

- Automatically correcting the eight cards already fixed by hand or the ones under review.
- Merging duplicate cards that share a serial (a separate cleanup: `1128172517`, `8397`, `415`,
  `C223184851`).
- Re-typing equipment (`IO`/`VO` cards carrying SI certificates — the весы at `1123271631`,
  `1128422515`).
- An admin report of every suspicious card in the fleet: the ambiguity probe covers it going
  forward, and the one-off audit was done with a script.

## Decisions

### Identity gate: ask Arshin which instruments carry the serial

After a candidate is chosen, the matcher asks Arshin for the records of that serial
(`mi_number`, one page) and counts the distinct instrument signatures `(mit_number, mi_modification)`
among the records whose serial matches the card. Exactly one signature means the serial identifies
the instrument; more than one means the choice was a guess, so the match is downgraded to "needs
review" with a note listing the types. *Alternative considered:* comparing the stored type against
the equipment name on the server — rejected as circular (the name came from the same wrong record)
and unusable for cards whose name was typed by hand.

### One probe per instrument that resolved a record

The probe costs one Arshin request, so it runs only after the refresh resolved a record for the
instrument — not for targets that found nothing at all. It also runs when the outcome is
«unchanged», because a stored certificate that belongs to another instrument is exactly the case
that must not read as «Актуальная запись подтверждена». A folder refresh of 450 instruments pays one
extra request per instrument that carries a certificate.

### The probe covers shared serials; the card covers contradictions

The probe cannot catch a card whose serial is unique in Arshin but whose certificate is of another
type (the ХАЛ case `685826`: a pressure calibrator card carrying an electricity-meter certificate,
whose serial matches the card). There the only signal is the contradiction between the card's
modification and the certificate's type, which is exactly what the card warning shows. The two
mechanisms are complementary, and neither rewrites data.

### The card warning uses the operator-visible anchors

The card compares the verification's type + modification with the card's own modification and name
using the same stem-based comparison used in the audit (`lib/equipmentDetails.ts`), and warns only
when the overlap is very low *and* the card carries a modification to compare with. That keeps
`2628` («Анализатор» мод. `МКУ`, whose certificate is a «МКУ» manometer record — most likely the same
instrument) quiet, and warns on `2582` («ИВТМ-7М» against a манометр certificate).

### No migration, no automatic repair

The gate rides on the existing result flags (`serial_requires_review` → `uncertain_update`) and the
row note; the card reads what the API already returns. Nothing rewrites a verification on detection —
that is the operator's call, and the repair path (Arshin refresh) already exists.

## Risks / Trade-offs

- [More review rows than before] → intended: a card whose serial is shared by several instruments
  *is* a question. The note names the types so the reviewer can answer it in one look.
- [The probe adds an Arshin request per matched instrument] → bounded to matched instruments, one
  page, and the client keeps its 429 backoff.
- [A legitimately shared serial keeps asking] → the note lists the signature count; merging the
  duplicates or giving the instrument a full serial are the real fixes.
- [The card warning could fire on a hand-typed name] → threshold-based and conservative: it needs a
  low overlap, a non-empty modification, and it never changes data.
