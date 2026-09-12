/**
 * @mrvltechnologies/journey-provenance — a small, generic evidence-provenance contract for
 * decision-support systems: what did we observe, from where, when, and how confident are we.
 *
 * This package intentionally contains no ranking, scoring, or recommendation logic. It answers
 * "what do we know and how sure are we" — not "what should happen next". Applications building
 * on top of this package own their own decision layer; this package only helps them be honest
 * about the evidence that layer consumes.
 *
 * Core doctrine (non-negotiable, carried from the system this package was extracted from):
 *   - Confidence is `null`/absent when there is not enough evidence to support a number.
 *     Never substitute a fabricated "neutral" default (e.g. 0.5) for missing evidence.
 *   - A source type distinguishes WHAT KIND of fact something is — a scheduled/reference value,
 *     a realtime observation, a predicted/estimated value, or an application's own derived
 *     conclusion. These are never collapsed into one generic "time" or "value".
 */

/**
 * The kind of fact a piece of evidence represents:
 *  - `SCHEDULED`   — a reference/timetable value (e.g. a published schedule), not live.
 *  - `REALTIME`    — a live, provider-observed fact (e.g. a live vehicle position).
 *  - `PREDICTED`   — an estimate or prediction (e.g. a routing engine's ETA). Supporting
 *                    evidence only — never treated as equivalent to a SCHEDULED or REALTIME fact.
 *  - `APP_DERIVED` — a conclusion the consuming application itself computed from other evidence,
 *                    not a fact a provider reported directly.
 */
export type EvidenceSourceType = 'SCHEDULED' | 'REALTIME' | 'PREDICTED' | 'APP_DERIVED';

/**
 * Provenance for one piece of evidence. Every field that could be unknown is nullable and must
 * be left `null`/absent rather than fabricated — a missing `confidence` means "we don't know
 * how confident to be", not "assume moderate confidence".
 */
export interface EvidenceProvenance {
  /** Identifier for the system/provider this evidence came from (e.g. "naptan", "acme-transit-api"). */
  providerId: string;
  sourceType: EvidenceSourceType;
  /** ISO 8601 — when the CONSUMING system fetched or derived this evidence. */
  fetchedAt: string;
  /** ISO 8601 — the provider's own timestamp for this evidence, when it supplies one. Never invented. */
  sourceTimestamp?: string | null;
  /** 0..1, or `null`/absent when there is not enough basis to state a confidence value. Never fabricated. */
  confidence?: number | null;
}

/** True only when `confidence` is a real, present number — never treats `null`/absent as 0. */
export function hasStatedConfidence(provenance: EvidenceProvenance): boolean {
  return typeof provenance.confidence === 'number';
}

/**
 * A short, human-readable summary of a provenance record — useful for logs/debugging, never
 * intended as end-user copy (an application's own UI layer should translate this, not display it
 * verbatim).
 */
export function describeProvenance(provenance: EvidenceProvenance): string {
  const confidencePart = hasStatedConfidence(provenance)
    ? `confidence=${provenance.confidence!.toFixed(2)}`
    : 'confidence=unstated';
  const agePart = provenance.sourceTimestamp ? `sourceTimestamp=${provenance.sourceTimestamp}` : 'sourceTimestamp=unknown';
  return `${provenance.providerId} (${provenance.sourceType}), fetchedAt=${provenance.fetchedAt}, ${agePart}, ${confidencePart}`;
}

/**
 * Freshness classification for evidence measured against a caller-supplied "now" and
 * threshold — kept generic (no domain-specific TTL baked in) since freshness requirements vary
 * enormously by domain (a live vehicle position and a static reference dataset have very
 * different useful lifespans).
 */
export type EvidenceFreshness = 'FRESH' | 'DEGRADED' | 'STALE';

export interface FreshnessThresholds {
  /** Evidence at or under this age (seconds) is FRESH. */
  freshMaxAgeSeconds: number;
  /** Evidence over `freshMaxAgeSeconds` but at or under this age (seconds) is DEGRADED; over it is STALE. */
  degradedMaxAgeSeconds: number;
}

export function classifyFreshness(
  provenance: Pick<EvidenceProvenance, 'sourceTimestamp'>,
  nowIso: string,
  thresholds: FreshnessThresholds,
): EvidenceFreshness | 'UNKNOWN' {
  if (!provenance.sourceTimestamp) return 'UNKNOWN';
  const ageSeconds = Math.max(0, (new Date(nowIso).getTime() - new Date(provenance.sourceTimestamp).getTime()) / 1000);
  if (ageSeconds <= thresholds.freshMaxAgeSeconds) return 'FRESH';
  if (ageSeconds <= thresholds.degradedMaxAgeSeconds) return 'DEGRADED';
  return 'STALE';
}
