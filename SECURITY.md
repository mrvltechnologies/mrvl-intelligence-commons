# Security Policy

> **Reporting contact: `security@mrvltechnologies.com` — active and monitored.**

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

**Preferred: GitHub Private Vulnerability Reporting** — Security → Report a vulnerability, on
this repository's GitHub page. This routes your report directly and privately to maintainers
without a public issue ever being created.

**Alternative: email `security@mrvltechnologies.com`.** This address remains available even
after Private Vulnerability Reporting is enabled — use whichever is more convenient.

When reporting, please include where possible:
- A description of the vulnerability and its potential impact.
- Steps to reproduce.
- Affected package(s) and version(s).
- Any relevant logs or code references.

### What to expect

- We aim to **acknowledge** your report within **2 business days**.
- We will begin triage promptly and let you know once we have.
- We will communicate material status changes as the report moves through triage and remediation.
- Where appropriate, we will coordinate a responsible disclosure timeline with you before any
  public advisory or fix is published.

We do not publish guaranteed fix deadlines by severity — remediation speed depends on real
factors (complexity, blast radius, need for coordinated disclosure) that vary case to case.
Internal severity-based targets exist to guide our own triage; they are operating targets, not
external commitments.

### Confidentiality

Reports are handled confidentially. We will not publicly disclose a vulnerability or your
identity as the reporter without your consent, except where required to protect users or by law,
and even then only after coordinating with you where possible.

### Good-faith security research

We consider security research conducted in good faith — testing only against your own
installations of this open-source code, not against MRVL's own production systems or other
users' deployments, without accessing data that isn't yours, and reporting promptly rather than
publicly disclosing before a fix is available — to be authorised and welcome. This policy does
not apply to MRVL's other, closed-source products or infrastructure.

## What to never include, anywhere in this repository or its issues/PRs

- Real API keys, tokens, or credentials for any provider (NaPTAN, BODS, or any other).
- Real customer or operator data.
- Internal MRVL infrastructure identifiers, hostnames, or connection strings.
- Any data captured from a live production system.

If you discover any of the above already present anywhere in this repository's history, please
report it through the private channel above rather than a public issue — it needs to be scrubbed
from history, not just the current tip.

## Supported versions

This project has not reached a `1.0.0` release. Only the latest `0.x` release of each package
receives fixes. A formal supported-version policy will be established once the project stabilises.

## Scope

This policy covers the code in this repository. It does not cover the third-party
data/standards/APIs this code can interoperate with (NaPTAN, TransXChange, SIRI, BODS) — report
vulnerabilities in those systems to their own respective owners.
