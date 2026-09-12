# Contributing

**PRE-RELEASE** — this repository is public, but no package has been published to npm yet.

## Developer Certificate of Origin (DCO), not a CLA

Every commit must be signed off:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer, certifying you wrote the
contribution (or otherwise have the right to submit it) under the [Developer Certificate of
Origin](https://developercertificate.org/). There is no separate Contributor License Agreement to
sign — DCO was chosen deliberately over a CLA to keep contribution low-friction for a project
built around externally-licensed reference data.

## What's welcome

- Parser/resolver improvements
- New open-data provider adapters (other transit operators, other transit standards)
- Synthetic test fixtures
- Standards mappings and interoperability documentation
- Bug fixes, performance improvements
- Documentation improvements

## What's not welcome — and why

- **Proprietary MRVL ranking/scoring/recommendation logic.** This repository doesn't have any to
  start with, by design, and it should never gain any. A PR that adds a "which candidate is best"
  opinion, rather than "what do we know about this candidate", is out of scope here regardless of
  how well-intentioned.
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
5. All changes to `main` go through a pull request with a passing CI check — direct pushes and
   force-pushes to `main` are disabled at the repository level. This project currently has a
   single maintainer; mandatory second-person review will be enabled once a second maintainer
   joins.

## Versioning

This project uses semantic versioning starting at `0.x` — expect breaking changes between minor
versions until a package reaches `1.0.0`. See each package's own `package.json` for its current
version.
