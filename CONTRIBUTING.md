# Contributing

**PRE-RELEASE / PRIVATE PREPARATION** — this repository is not yet published; this document
describes the process that will apply once it is.

## Developer Certificate of Origin (DCO), not a CLA

Every commit must be signed off:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer, certifying you wrote the
contribution (or otherwise have the right to submit it) under the [Developer Certificate of
Origin](https://developercertificate.org/). There is no separate Contributor License Agreement to
sign. See `MAGI_INTELLIGENCE_COMMONS.md` §J (this project's parent governance document) for why
DCO was chosen over a CLA.

## What's welcome

- Parser/resolver improvements
- New open-data provider adapters (other transit operators, other transit standards)
- Synthetic test fixtures
- Standards mappings and interoperability documentation
- Bug fixes, performance improvements
- Documentation improvements

## What's not welcome — and why

- **Proprietary MRVL ranking/scoring/recommendation logic.** This repository doesn't have any to
  start with (by design — see the crown-jewel exclusion in `MAGI_INTELLIGENCE_COMMONS.md` §E),
  and it should never gain any. A PR that adds a "which candidate is best" opinion, rather than
  "what do we know about this candidate", is out of scope here regardless of how well-intentioned.
- **Copied real commercial-provider data** (e.g. real Google/Duffel API responses) — synthetic
  fixtures only.
- **Real customer or operator data.**
- **Provider credentials of any kind** — no API key, token, or endpoint secret belongs in this
  repository, an issue, or a PR, ever.
- **A new provider adapter without its licensing basis.** If you're proposing a new open-data
  adapter, include the same information as `THIRD_PARTY_NOTICES.md`'s existing rows (owner,
  licence, redistribution rights, attribution requirement, fixture policy) — a PR without this
  will be asked for it before review, not merged provisionally.
- **Unlicensed standards text** — implement a standard's wire format in your own code; don't
  paste in the standard document itself.

## Pull request process

1. Fork, branch, make your change with DCO-signed commits.
2. Add/update tests — every package must remain testable with synthetic fixtures only, no live
   credentials.
3. Run `npm test` and `npm run build` locally; both must pass clean.
4. Open a PR using the template in `.github/PULL_REQUEST_TEMPLATE.md`.
5. A maintainer from the relevant package's owning team reviews. No unreviewed merges to the
   default branch.

## Versioning

This project uses semantic versioning starting at `0.x` — expect breaking changes between minor
versions until a package reaches `1.0.0`. See each package's own `package.json` for its current
version.
