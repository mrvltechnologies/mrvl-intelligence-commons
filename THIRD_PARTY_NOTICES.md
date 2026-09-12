# Third-Party Notices

**PRE-RELEASE / PRIVATE PREPARATION.** This document records the licensing basis for external
data and standards this project's code interoperates with. It distinguishes two different
things throughout, deliberately:

- **USED AT RUNTIME** — this project's code can call/parse this provider's data when you run it.
- **INCLUDED / REDISTRIBUTED IN THIS REPOSITORY** — this repository's own committed files
  contain a copy of that provider's data or standard text.

The Apache-2.0 licence in `LICENSE` covers **MRVL-authored source code** in this repository only.
It does not, and cannot, relicense the external data or standards listed below — each remains
subject to its own owner's terms. Findings below were verified against primary sources on
2026-09-11 (see the research trail in `MAGI_INTELLIGENCE_COMMONS.md`, this project's parent
governance canon); two items remain open questions, named precisely, not left as a vague
placeholder.

| Dependency | Owner/Publisher | Used at runtime? | Included/redistributed in this repo? | Licence/terms | Attribution |
|---|---|---|---|---|---|
| **NaPTAN** (stop-point reference data) | UK Department for Transport | Yes — `naptanStopResolver.ts` fetches NaPTAN's own public CSV export at runtime | **No** — not bundled; test fixtures use fictional stop data (see `packages/uk-transit-resolver/fixtures/synthetic/README.md`) | **CONFIRMED**: Open Government Licence v3.0, Crown copyright | Required when NaPTAN data is displayed/used: *"Contains public sector information licensed under the Open Government Licence v3.0."* |
| **TransXChange schema** (XML structure) | UK Department for Transport | Yes — `txcJourneyResolver.ts` implements/parses this schema's wire format | **No** — the schema's own XSD/PDF documentation is not bundled; this repo contains only original MRVL-authored parsing code and fictional test fixtures | **CONFIRMED**: Crown copyright, free reproduction with acknowledgement (the schema's own Terms & Conditions document was not independently fetched this pass — treat the acknowledgement requirement as binding regardless) | Required: acknowledge Crown copyright and the document title when the schema itself (not code implementing it) is reproduced |
| **TransXChange schedule data** (an individual operator's actual published timetable) | The originating bus operator | Not used by this repository's own tests — a real deployment consuming this module would fetch it at runtime, separately | **No — never redistribute this.** | **UNCLEAR — LEGAL REVIEW.** Rights in operator-originated schedule content are historically understood to belong to the publishing operator, separate from the schema itself; not independently reconfirmed as current wording | N/A — do not bundle real operator schedule data in this repository under any circumstances until this is resolved |
| **SIRI-VM live vehicle data** (via BODS) | The originating bus operator | Yes — `busOperationalProvider.ts` parses this format from a caller-supplied endpoint | **No** — no captured live SIRI-VM payload is bundled; test fixtures are fictional | Same operator-originated-data caveat as TransXChange schedule data | N/A — never bundle real captured SIRI-VM data |
| **SIRI standard** (CEN/TS 15531, the specification SIRI-VM profiles from) | CEN, sold via national standards bodies (BSI in the UK) | Indirectly — this project's code implements the SIRI-VM wire *shape*, informed by publicly summarised field semantics | **No — never redistribute the standard document or any BSI/CEN-sourced XSD.** | **CONFIRMED**: copyright CEN, available at a cost through BSI; "no such material may be reproduced, stored in a retrieval system or transmitted... without prior written permission of BSI" | N/A — implementing a wire format described by a standard, in original code, is not reproducing the standard document |
| **BODS** (Bus Open Data Service — the API/portal itself) | UK Department for Transport | Yes, indirectly — a real deployment would query BODS via its own proxy; this repository's code is provider-independent and does not embed a BODS endpoint | No | Strong circumstantial evidence of OGL-consistent terms; **BODS's own primary terms-of-use page was not independently confirmed this pass** (automated fetch returned HTTP 403) | Treat as OGL-consistent pending confirmation; do not treat as fully cleared |

## Fixture policy (binding, not just a description)

All test fixtures in this repository use **fictional** town names, route numbers, operator
references, and stop identifiers (see `packages/uk-transit-resolver/fixtures/synthetic/README.md`).
No fixture in this repository is, or should ever become, a captured real BODS/TransXChange/SIRI-VM
payload, or a real operator's published schedule, without a corresponding update to the licensing
row above confirming redistribution rights first.

## Software dependencies

This project's `devDependencies` (TypeScript, Vitest and their own transitive dependencies) are
each under their own respective open-source licences (MIT/Apache-2.0/BSD, standard for this
tooling ecosystem) — not enumerated line-by-line here since none of their code is bundled or
redistributed in this repository's own published output; they are build/test tooling only. A
`NOTICE`-file obligation would apply if that changes.

## Open legal questions (see `MAGI_INTELLIGENCE_COMMONS.md` for full context)

- **LEGAL-01**: Confirm the precise rights basis for operator-originated TransXChange schedule
  content, as distinct from the schema itself (confirmed Crown copyright) and from NaPTAN
  (confirmed OGL v3.0).
- **LEGAL-02**: Confirm BODS's own primary terms-of-use page (blocked from automated fetch this
  pass — needs a manual/browser check or a direct enquiry to the DfT BODS team).

Neither gate is required for private engineering preparation. Both must be cleared, by a human
with the ability to independently verify primary sources (and ideally professional legal review
per `MAGI_INTELLIGENCE_COMMONS.md` §O), before this repository's visibility changes to public.
