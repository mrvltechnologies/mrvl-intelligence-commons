# mrvl-intelligence-commons

> **STATUS: PRE-RELEASE.** This source repository is public, but no package has been published
> to npm yet — there is no installable release. Everything below describes the packages this
> project will publish, and what you'll be able to `npm install` once that happens.

## What this is

Reusable infrastructure primitives that help applications ingest, normalise, resolve identity,
and preserve provenance around open/standardised transport and travel data — evidence contracts
and interoperability tooling, not a decision engine.

Included so far (all `0.x`, not yet published):

- **`@mrvltechnologies/journey-provenance`** — a generic evidence-provenance contract (source type,
  confidence, freshness) for decision-support systems.
- **`@mrvltechnologies/air-candidate-types`** — provider-independent flight-offer and ground-access candidate
  types, with the same honesty rules baked in ("unknown time is not instant", "unknown cost is
  not zero").
- **`@mrvltechnologies/uk-transit-resolver`** — UK bus operational-data interoperability: NaPTAN stop
  identity resolution, TransXChange scheduled-journey parsing, and SIRI-VM live-vehicle
  correlation.

## What this is not

- **Not a decision engine.** Nothing here ranks, scores, or recommends anything. These packages
  answer "what do we know and how sure are we" — what an application does with that evidence is
  entirely up to the application.
- **Not Magi OS.** Magi OS is MRVL's internal portfolio intelligence architecture and doctrine —
  strategic, proprietary, and not published here.
- **Not a dump of MRVL product code.** Everything here was deliberately re-extracted and
  genericised from MRVL's own internal systems, with proprietary decision logic, product-specific
  types, and commercial thresholds excluded, against MRVL's own internal admission criteria for
  what may be published here.

## Philosophy

**Providers provide evidence. Applications make decisions.**

Every type and function in this repository is built around that split: a provider fact, a
prediction, and an application's own derived conclusion are never collapsed into one generic
value, and missing evidence is represented honestly (`null`/an explicit `UNAVAILABLE` state)
rather than defaulted to a plausible-looking guess.

## Getting started

```bash
git clone https://github.com/mrvltechnologies/mrvl-intelligence-commons.git
cd mrvl-intelligence-commons
npm install
npm test
```

No credentials, API keys, or access to any MRVL system are required to build or test this
repository — every test uses synthetic fixtures or mocked providers. See
`packages/uk-transit-resolver/fixtures/synthetic/README.md` for the fixture policy.

## Licensing

The Apache License, Version 2.0 (`LICENSE`) covers **MRVL-authored source code** in this
repository. External datasets, standards, and APIs this code can interoperate with (NaPTAN,
TransXChange, SIRI, BODS) remain subject to their own respective terms — see
`THIRD_PARTY_NOTICES.md` for the full basis. This release bundles no third-party data of any
kind (only original code and synthetic test fixtures), so `THIRD_PARTY_NOTICES.md`'s two open
questions about *real* operator/BODS data do not apply to what is actually shipped here; they
remain open questions for any future release that would bundle real operator schedule or BODS
data.

Apache-2.0 grants rights to the code in this repository. It does not grant any right to use
"MRVL", "Magi OS", "MJIP", or any MRVL product name or logo to imply official status,
sponsorship, or endorsement. Forks and derivative projects are welcome but must not present
themselves as an official MRVL Technologies service.

## Contributing

See `CONTRIBUTING.md`. This project uses the Developer Certificate of Origin (DCO), not a CLA —
sign off your commits (`git commit -s`), no separate agreement to sign.

## Security

See `SECURITY.md` for how to report a vulnerability. Never include real credentials, API keys, or
customer/operator data in an issue, pull request, or test fixture.
